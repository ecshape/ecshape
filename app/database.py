from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import declarative_base, sessionmaker
import os
import logging
import time
from dotenv import load_dotenv
from contextlib import contextmanager
from typing import Generator, Any

# Configure logging
logger = logging.getLogger(__name__)

load_dotenv()

# Get environment (production vs development)
# Use same auto-detection logic as main.py to handle Railway and other platforms
def detect_environment():
    """Universal environment detection that works with any deployment method."""
    # Check for explicit environment setting
    env = os.getenv("ENVIRONMENT")
    if env:
        return env.lower()
    
    # Auto-detect production environments (same logic as main.py)
    production_indicators = [
        os.getenv("RAILWAY_PUBLIC_DOMAIN"),      # Railway
        os.getenv("RAILWAY_STATIC_URL"),         # Railway
        os.getenv("RENDER_EXTERNAL_URL"),        # Render
        os.getenv("HEROKU_APP_NAME"),            # Heroku
        os.getenv("VERCEL_URL"),                 # Vercel
        os.getenv("NETLIFY_URL"),                # Netlify
        os.getenv("PORT"),                       # Any cloud platform
    ]
    
    # If any production indicator is present, assume production
    if any(indicator for indicator in production_indicators):
        return "production"
    
    # Default to development for local development
    return "development"

ENVIRONMENT = detect_environment()

# Get database path from environment variable
# For Railway: use /app/persistent/data/elior_fitness.db (persistent volume)
# For local dev: use ./data/elior_fitness.db
persistent_base = os.getenv("PERSISTENT_PATH", "/app/persistent")
# Check if we're in Railway (persistent path exists) or use local dev path
if os.path.exists(persistent_base):
    default_db_path = os.path.join(persistent_base, "data", "elior_fitness.db")
else:
    default_db_path = "./data/elior_fitness.db"
DATABASE_PATH = os.getenv("DATABASE_PATH", default_db_path)

# Ensure the path is absolute for better reliability
if not os.path.isabs(DATABASE_PATH):
    DATABASE_PATH = os.path.abspath(DATABASE_PATH)

# Get database URL from environment variable
DATABASE_URL_ENV = os.getenv("DATABASE_URL")
DATABASE_PUBLIC_URL_ENV = os.getenv("DATABASE_PUBLIC_URL")  # Railway public URL fallback

# Helper function to mask password in connection string for logging
def mask_password_in_url(url: str) -> str:
    """Mask password in database URL for safe logging."""
    if not url:
        return "None"
    try:
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(url)
        if parsed.password:
            # Replace password with ***
            masked_netloc = parsed.netloc.replace(f":{parsed.password}@", ":***@")
            masked_parsed = parsed._replace(netloc=masked_netloc)
            return urlunparse(masked_parsed)
        return url
    except Exception:
        # If parsing fails, just show first 50 chars
        return f"{url[:50]}..." if len(url) > 50 else url

# Log received DATABASE_URL (with password masked)
logger.info("=" * 60)
logger.info("DATABASE_URL ENVIRONMENT VARIABLE CHECK")
logger.info("=" * 60)
logger.info(f"ENVIRONMENT: {ENVIRONMENT}")
logger.info(f"DATABASE_URL received: {mask_password_in_url(DATABASE_URL_ENV)}")
logger.info(f"DATABASE_URL is None: {DATABASE_URL_ENV is None}")
logger.info(f"DATABASE_URL is empty string: {DATABASE_URL_ENV == ''}")
if DATABASE_URL_ENV:
    logger.info(f"DATABASE_URL starts with 'postgresql': {DATABASE_URL_ENV.startswith('postgresql')}")
    logger.info(f"DATABASE_URL starts with 'sqlite': {DATABASE_URL_ENV.startswith('sqlite')}")
    logger.info(f"DATABASE_URL length: {len(DATABASE_URL_ENV)}")
if DATABASE_PUBLIC_URL_ENV:
    logger.info(f"DATABASE_PUBLIC_URL received: {mask_password_in_url(DATABASE_PUBLIC_URL_ENV)}")
else:
    logger.info("DATABASE_PUBLIC_URL: Not set")
logger.info("=" * 60)

# In production, DATABASE_URL MUST be set and MUST be PostgreSQL
if ENVIRONMENT == "production":
    if not DATABASE_URL_ENV:
        # Try public URL as fallback
        if DATABASE_PUBLIC_URL_ENV and DATABASE_PUBLIC_URL_ENV.startswith("postgresql"):
            logger.warning("DATABASE_URL not set, using DATABASE_PUBLIC_URL as fallback")
            DATABASE_URL_ENV = DATABASE_PUBLIC_URL_ENV
        else:
            error_msg = (
                "CRITICAL: DATABASE_URL environment variable is not set in production! "
                "PostgreSQL connection string is required. "
                "Please set DATABASE_URL in Railway service variables."
            )
            logger.error(error_msg)
            raise ValueError(error_msg)
    
    if DATABASE_URL_ENV.startswith("sqlite"):
        error_msg = (
            "CRITICAL: SQLite is not allowed in production! "
            "DATABASE_URL must be a PostgreSQL connection string. "
            f"Current value starts with 'sqlite://' which is not allowed in production."
        )
        logger.error(error_msg)
        raise ValueError(error_msg)
    
    if not DATABASE_URL_ENV.startswith("postgresql"):
        error_msg = (
            f"CRITICAL: Invalid database URL in production! "
            f"DATABASE_URL must be a PostgreSQL connection string (starting with 'postgresql://'). "
            f"Current value: {DATABASE_URL_ENV[:50]}..."
        )
        logger.error(error_msg)
        raise ValueError(error_msg)
    
    # Check if using internal Railway URL - prefer public URL if available
    # Internal URLs often have connectivity issues on Railway
    if ".railway.internal" in DATABASE_URL_ENV:
        if DATABASE_PUBLIC_URL_ENV and DATABASE_PUBLIC_URL_ENV.startswith("postgresql"):
            logger.warning(
                "Internal Railway URL detected. Using public URL instead for better connectivity."
            )
            SQLALCHEMY_DATABASE_URL = DATABASE_PUBLIC_URL_ENV
        else:
            SQLALCHEMY_DATABASE_URL = DATABASE_URL_ENV
            logger.warning(
                "Internal Railway URL detected but DATABASE_PUBLIC_URL not set. "
                "If connection fails, set DATABASE_PUBLIC_URL in Railway variables."
)
    else:
        SQLALCHEMY_DATABASE_URL = DATABASE_URL_ENV
    
    logger.info("Production mode: Using PostgreSQL database (SQLite fallback disabled)")

else:
    # Development mode: Allow SQLite fallback
    SQLALCHEMY_DATABASE_URL = DATABASE_URL_ENV or f"sqlite:///{DATABASE_PATH}"
    logger.info(f"Development mode: Database URL: {SQLALCHEMY_DATABASE_URL[:50]}...")

# Log final DATABASE_URL being used (with password masked)
logger.info("=" * 60)
logger.info("FINAL DATABASE CONFIGURATION")
logger.info("=" * 60)
logger.info(f"Final SQLALCHEMY_DATABASE_URL: {mask_password_in_url(SQLALCHEMY_DATABASE_URL)}")
logger.info(f"Database type: {'PostgreSQL' if SQLALCHEMY_DATABASE_URL.startswith('postgresql') else 'SQLite'}")
logger.info("=" * 60)

# Database configuration based on database type
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    logger.info("Configuring SQLite database with optimizations...")
    
    # Ensure the data directory exists
    db_path = SQLALCHEMY_DATABASE_URL.replace("sqlite:///", "")
    db_dir = os.path.dirname(db_path)
    try:
        os.makedirs(db_dir, exist_ok=True)
        logger.info(f"Database directory created/verified: {db_dir}")
    except Exception as e:
        logger.error(f"Failed to create database directory: {e}")
        raise
    
    # SQLite-specific optimizations
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,  # 5 minutes
        echo=False,  # Set to True for debugging
        connect_args={
            "check_same_thread": False,
            "timeout": 20  # 20 second timeout for SQLite
        }
    )
    
    # SQLite performance optimizations - OPTIMIZED FOR MINIMAL RESOURCES
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        """Set SQLite-specific performance optimizations for minimal resource usage."""
        cursor = dbapi_connection.cursor()
        # Enable WAL mode for better concurrency
        cursor.execute("PRAGMA journal_mode=WAL")
        # MINIMAL cache size for lowest memory usage (reduced from 8MB to 2MB)
        cursor.execute("PRAGMA cache_size=-2048")  # 2MB cache (was 8MB)
        # Enable foreign keys
        cursor.execute("PRAGMA foreign_keys=ON")
        # Optimize synchronous mode for better performance
        cursor.execute("PRAGMA synchronous=NORMAL")
        # Set temp store to memory (minimal)
        cursor.execute("PRAGMA temp_store=MEMORY")
        # Optimize page size
        cursor.execute("PRAGMA page_size=4096")
        # MINIMAL memory mapping for lowest memory usage (reduced from 32MB to 8MB)
        cursor.execute("PRAGMA mmap_size=8388608")  # 8MB (was 32MB)
        cursor.close()
    
    logger.info("SQLite engine created with performance optimizations")

else:
    logger.info("Configuring PostgreSQL database with connection pooling...")
    
    # Verify psycopg2 is installed (required for PostgreSQL)
    try:
        import psycopg2
        logger.info(f"psycopg2 is available (version: {psycopg2.__version__})")
    except ImportError:
        error_msg = (
            "CRITICAL: psycopg2-binary is not installed! "
            "PostgreSQL requires psycopg2-binary package. "
            "Please ensure requirements.txt includes 'psycopg2-binary>=2.9.9' and rebuild the Docker image."
        )
        logger.error(error_msg)
        if ENVIRONMENT == "production":
            raise ImportError(error_msg)
        else:
            logger.warning(f"Warning: {error_msg}")
    
    # Log connection details and determine SSL mode
    try:
        from urllib.parse import urlparse
        parsed_url = urlparse(SQLALCHEMY_DATABASE_URL)
        logger.info(f"PostgreSQL connection details: host={parsed_url.hostname}, port={parsed_url.port}, database={parsed_url.path.lstrip('/')}, user={parsed_url.username}")
    except Exception:
        parsed_url = None
        logger.warning("Could not parse DATABASE_URL for connection details")
    
    # Determine SSL mode based on URL type
    if parsed_url:
        is_public_url = "proxy.rlwy.net" in parsed_url.hostname or "railway.app" in parsed_url.hostname
        is_internal_url = ".railway.internal" in parsed_url.hostname
    else:
        is_public_url = "proxy.rlwy.net" in SQLALCHEMY_DATABASE_URL or "railway.app" in SQLALCHEMY_DATABASE_URL
        is_internal_url = ".railway.internal" in SQLALCHEMY_DATABASE_URL
    
    # SSL configuration: try different modes for Railway connectivity issues
    if is_public_url:
        # Public URLs might need allow or disable if require fails
        ssl_mode = "allow"  # Changed from require to allow for Railway compatibility
        logger.info("Using SSL mode 'allow' for public Railway URL (more permissive)")
    elif is_internal_url:
        ssl_mode = "disable"  # Internal URLs often don't need SSL
        logger.info("Using SSL mode 'disable' for internal Railway URL")
    else:
        ssl_mode = "prefer"  # Default to prefer for other URLs
        logger.info("Using SSL mode 'prefer' for database connection")
    
    # PostgreSQL-specific optimizations with improved error handling
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_size=5,  # Reduced for Railway (was 20)
        max_overflow=10,  # Reduced for Railway (was 30)
        pool_pre_ping=True,  # Verify connections before use
        pool_recycle=3600,  # Recycle connections after 1 hour
        echo=False,  # Set to True for debugging
        connect_args={
            "options": "-c statement_timeout=30000",  # 30 second timeout
            "connect_timeout": 10,  # Reduced timeout to fail faster and retry
            "application_name": "elior_fitness_api",
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5,
            "sslmode": ssl_mode
        }
    )
    
    # PostgreSQL performance optimizations
    @event.listens_for(engine, "connect")
    def set_postgresql_optimizations(dbapi_connection, connection_record):
        """Set PostgreSQL-specific optimizations."""
        with dbapi_connection.cursor() as cursor:
            # Enable query plan caching
            cursor.execute("SET plan_cache_mode = 'force_generic_plan'")
            # REDUCED work memory for minimal RAM usage
            cursor.execute("SET work_mem = '16MB'")  # Reduced from 32MB to 16MB
            # REDUCED parallel workers for minimal RAM usage
            cursor.execute("SET max_parallel_workers_per_gather = 2")  # Reduced from 4 to 2
            # Optimize random page cost for SSDs
            cursor.execute("SET random_page_cost = 1.1")
            # Enable JIT compilation for complex queries
            cursor.execute("SET jit = on")
    
    logger.info("PostgreSQL engine created with performance optimizations")

# REMOVED: Expensive query monitoring for minimal resource usage
# @event.listens_for(engine, "before_cursor_execute")
# def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
#     """Monitor query execution time."""
#     context._query_start_time = time.time()

# @event.listens_for(engine, "after_cursor_execute")
# def receive_after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
#     """Log slow queries."""
#     total = time.time() - context._query_start_time
#     if total > 0.1:  # Log queries taking more than 100ms
#         logger.warning(f"Slow query: {total:.3f}s - {statement[:100]}...")

# Create SessionLocal class with optimized configuration
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False  # Prevent lazy loading after commit
)

logger.info("SessionLocal class created with optimizations")

# Create Base class
Base = declarative_base()
logger.info("Base class created")

# Optimized dependency with proper error handling
def get_db():
    """Database session dependency with error handling."""
    logger.debug("Creating database session")
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        logger.debug("Closing database session")
        db.close()

# Context manager for database operations
@contextmanager
def get_db_context() -> Generator[Any, None, None]:
    """Context manager for database operations."""
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database context error: {e}")
        db.rollback()
        raise
    finally:
        db.close()

# Connection health check function
def check_db_connection() -> bool:
    """Check if database connection is healthy."""
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            result.fetchone()
        return True
    except Exception as e:
        logger.error(f"Database connection health check failed: {e}")
        return False

# Get database connection pool statistics
def get_db_pool_stats() -> dict:
    """Get database connection pool statistics."""
    try:
        pool = engine.pool
        stats = {
            "pool_size": pool.size(),
            "checked_in_connections": pool.checkedin(),
            "checked_out_connections": pool.checkedout(),
            "overflow_connections": pool.overflow()
        }
        
        # Add invalid connections if available (PostgreSQL only)
        if hasattr(pool, 'invalid'):
            stats["invalid_connections"] = pool.invalid()
        
        return stats
    except Exception as e:
        logger.error(f"Failed to get pool stats: {e}")
        return {"error": str(e)}

# Database initialization function with retry logic and network diagnostics
def init_database(max_retries=5, retry_delay=10):
    """Initialize database with all tables, with retry logic for connection issues."""
    import time
    import socket
    
    # Log connection diagnostics
    try:
        from urllib.parse import urlparse
        parsed = urlparse(SQLALCHEMY_DATABASE_URL)
        hostname = parsed.hostname
        port = parsed.port or 5432
        logger.info(f"Attempting to connect to: {hostname}:{port}")
        
        # Test DNS resolution first
        try:
            resolved_ip = socket.gethostbyname(hostname)
            logger.info(f"✓ DNS resolution successful: {hostname} -> {resolved_ip}")
        except socket.gaierror as e:
            logger.error(f"✗ DNS resolution failed for {hostname}: {e}")
            logger.error("  This usually means:")
            logger.error("  - Hostname is incorrect")
            logger.error("  - Services are not in the same Railway project")
            logger.error("  - Railway's internal DNS is not working")
        except Exception as e:
            logger.warning(f"⚠ DNS resolution test failed: {e}")
        
        # Test basic network connectivity
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10)  # Increased timeout for network test
            result = sock.connect_ex((hostname, port))
            sock.close()
            
            if result == 0:
                logger.info("✓ Network connectivity test passed - port is reachable")
            else:
                # Map common socket error codes to human-readable messages
                error_messages = {
                    11: "EAGAIN - Resource temporarily unavailable (connection refused or host unreachable)",
                    111: "ECONNREFUSED - Connection refused (service not running or port closed)",
                    110: "ETIMEDOUT - Connection timed out (firewall blocking or service not responding)",
                    113: "EHOSTUNREACH - No route to host (network routing issue)",
                }
                error_msg = error_messages.get(result, f"Error code {result}")
                logger.error(f"✗ Network connectivity test failed: {error_msg}")
                logger.error("  Possible causes:")
                logger.error("  1. PostgreSQL service is not running or not ready")
                logger.error("  2. Services are not properly linked in Railway")
                logger.error("  3. Network firewall is blocking the connection")
                logger.error("  4. Services are in different Railway projects/regions")
                logger.error("  5. Railway's internal network is not configured correctly")
        except socket.gaierror as e:
            logger.error(f"✗ DNS resolution failed during connection test: {e}")
        except Exception as e:
            logger.warning(f"⚠ Network test failed: {e}")
    except Exception as e:
        logger.warning(f"Could not parse URL for diagnostics: {e}")
    
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Initializing database tables... (attempt {attempt}/{max_retries})")
            
            # Test connection first with explicit timeout
            logger.info("Testing database connection...")
            with engine.connect() as conn:
                result = conn.execute(text("SELECT 1 as test"))
                test_value = result.fetchone()
                logger.info(f"✓ Connection test successful: {test_value}")
            
            # Create tables
            logger.info("Creating database tables...")
            Base.metadata.create_all(bind=engine)
            logger.info("✓ Database tables initialized successfully")
            return True
            
        except Exception as e:
            error_msg = str(e)
            logger.warning(f"Database initialization attempt {attempt} failed: {error_msg}")
            
            # More detailed error diagnostics
            if "timeout" in error_msg.lower():
                logger.error("Connection timeout detected. Possible causes:")
                logger.error("  - PostgreSQL service is not running or not ready")
                logger.error("  - Network firewall blocking connection")
                logger.error("  - Incorrect hostname/port in DATABASE_URL")
                logger.error("  - SSL/TLS handshake failing")
            elif "connection" in error_msg.lower():
                logger.error("Connection error detected. Possible causes:")
                logger.error("  - Services not properly linked in Railway")
                logger.error("  - PostgreSQL service is down")
                logger.error("  - Network connectivity issues")
            
            if attempt < max_retries:
                logger.info(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
                retry_delay = min(retry_delay * 1.5, 30)  # Exponential backoff, max 30s
            else:
                logger.error(f"Failed to initialize database after {max_retries} attempts")
                logger.error("Final diagnostics:")
                logger.error("  1. Verify DATABASE_URL is correct in Railway variables")
                logger.error("  2. Check PostgreSQL service is running and healthy")
                logger.error("  3. Ensure services are in the same Railway project")
                logger.error("  4. Try using internal URL if public URL fails")
                logger.error("  5. Check Railway service logs for PostgreSQL errors")
                return False
    
        return False

logger.info("Database configuration completed successfully") 