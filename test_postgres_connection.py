#!/usr/bin/env python3
"""
Test PostgreSQL connection script for Railway debugging.
Run this inside the Railway container to diagnose connection issues.
"""
import os
import sys
import time
from urllib.parse import urlparse

def test_connection():
    """Test PostgreSQL connection with detailed diagnostics."""
    print("=" * 60)
    print("PostgreSQL Connection Diagnostic Tool")
    print("=" * 60)
    
    # Get DATABASE_URL from environment
    database_url = os.getenv("DATABASE_URL")
    
    if not database_url:
        print("❌ ERROR: DATABASE_URL environment variable is not set!")
        print("\nAvailable environment variables:")
        for key, value in sorted(os.environ.items()):
            if "DATABASE" in key or "POSTGRES" in key:
                # Mask password in output
                if "password" in key.lower() or "@" in str(value):
                    parsed = urlparse(str(value))
                    if parsed.password:
                        masked = str(value).replace(parsed.password, "***")
                        print(f"  {key}={masked}")
                    else:
                        print(f"  {key}={value}")
                else:
                    print(f"  {key}={value}")
        return False
    
    print(f"\n✓ DATABASE_URL is set")
    
    # Parse the connection string
    try:
        parsed = urlparse(database_url)
        print(f"\nConnection Details:")
        print(f"  Scheme: {parsed.scheme}")
        print(f"  Host: {parsed.hostname}")
        print(f"  Port: {parsed.port}")
        print(f"  Database: {parsed.path.lstrip('/')}")
        print(f"  Username: {parsed.username}")
        print(f"  Password: {'***' if parsed.password else 'Not set'}")
    except Exception as e:
        print(f"❌ ERROR parsing DATABASE_URL: {e}")
        return False
    
    # Test if psycopg2 is available
    print(f"\nTesting psycopg2 availability...")
    try:
        import psycopg2
        print(f"✓ psycopg2 is installed (version: {psycopg2.__version__})")
    except ImportError as e:
        print(f"❌ ERROR: psycopg2 is not installed!")
        print(f"   Error: {e}")
        return False
    
    # Test network connectivity first
    print(f"\nTesting network connectivity...")
    hostname = parsed.hostname
    port = parsed.port or 5432
    
    try:
        import socket
        print(f"  Testing connection to {hostname}:{port}...")
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex((hostname, port))
        sock.close()
        
        if result == 0:
            print(f"  ✓ Network connection successful")
        else:
            print(f"  ❌ Network connection failed (error code: {result}, {os.getenv("DATABASE_URL")})")
            print(f"     This suggests the hostname/port is not reachable")
            print(f"     Try using DATABASE_PUBLIC_URL instead of DATABASE_URL")
            return False
    except socket.gaierror as e:
        print(f"  ❌ DNS resolution failed: {e}")
        print(f"     Hostname '{hostname}' cannot be resolved")
        return False
    except Exception as e:
        print(f"  ⚠️  Network test failed: {e},{os.getenv("DATABASE_URL")}")
        print(f"     Continuing with connection test anyway...")
    
    # Test basic connection
    print(f"\nTesting PostgreSQL connection...")
    max_retries = 5
    retry_delay = 3
    
    for attempt in range(1, max_retries + 1):
        try:
            print(f"  Attempt {attempt}/{max_retries}...")
            conn = psycopg2.connect(
                database_url,
                connect_timeout=15
            )
            
            # Test query
            cursor = conn.cursor()
            cursor.execute("SELECT version();")
            version = cursor.fetchone()[0]
            print(f"✓ Connected successfully!")
            print(f"  PostgreSQL version: {version.split(',')[0]}")
            
            # Check database
            cursor.execute("SELECT current_database();")
            db_name = cursor.fetchone()[0]
            print(f"  Current database: {db_name}")
            
            # List tables
            cursor.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name;
            """)
            tables = cursor.fetchall()
            print(f"  Tables in database: {len(tables)}")
            if tables:
                print(f"    {', '.join([t[0] for t in tables[:10]])}")
                if len(tables) > 10:
                    print(f"    ... and {len(tables) - 10} more")
            else:
                print(f"    (No tables found - database is empty)")
            
            cursor.close()
            conn.close()
            
            print(f"\n✅ All connection tests passed!")
            return True
            
        except psycopg2.OperationalError as e:
            error_msg = str(e)
            print(f"  ❌ Connection failed: {error_msg}")
            
            if attempt < max_retries:
                print(f"  Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
            else:
                print(f"\n❌ Failed to connect after {max_retries} attempts")
                print(f"\nTroubleshooting tips:")
                print(f"  1. Check if PostgreSQL service is running in Railway")
                print(f"  2. Verify DATABASE_URL is correct")
                print(f"  3. Check if services are linked in Railway")
                print(f"  4. Try using DATABASE_PUBLIC_URL instead of DATABASE_URL")
                return False
                
        except Exception as e:
            print(f"  ❌ Unexpected error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    return False

if __name__ == "__main__":
    success = test_connection()
    sys.exit(0 if success else 1)

