import os
import platform
import subprocess
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

# Use environment variable or default for DB path
# For Railway: use /app/persistent/data/elior_fitness.db (persistent volume)
# For local dev: use ./data/elior_fitness.db
persistent_base = os.getenv("PERSISTENT_PATH", "/app/persistent")
# Check if we're in Railway (persistent path exists) or use local dev path
if os.path.exists(persistent_base):
    default_db_path = os.path.join(persistent_base, "data", "elior_fitness.db")
else:
    default_db_path = "./data/elior_fitness.db"
DB_PATH = os.getenv("DATABASE_PATH", default_db_path)

class SystemService:
    def __init__(self):
        # Lazy load heavy libraries to reduce startup memory
        self.docker_client = None
        self._psutil = None
        self._docker = None
        
    def _get_psutil(self):
        """Lazy load psutil only when needed."""
        if self._psutil is None:
            import psutil
            self._psutil = psutil
        return self._psutil
    
    def _get_docker(self):
        """Lazy load docker only when needed."""
        if self._docker is None:
            try:
                import docker
                self._docker = docker
            except ImportError:
                logger.warning("Docker package not installed. Docker monitoring will be disabled.")
                self._docker = None
        return self._docker
    
    def _get_docker_client(self):
        """Lazy load docker client only when needed."""
        if self.docker_client is None:
            try:
                docker = self._get_docker()
                self.docker_client = docker.from_env()
            except Exception as e:
                logger.warning(f"Docker client initialization failed: {e}")
                self.docker_client = None
    
    def get_system_uptime(self) -> str:
        """Get system uptime."""
        try:
            psutil = self._get_psutil()
            boot_time = datetime.fromtimestamp(psutil.boot_time())
            uptime = datetime.now() - boot_time
            days = uptime.days
            hours = uptime.seconds // 3600
            minutes = (uptime.seconds % 3600) // 60
            return f"{days} days, {hours} hours, {minutes} minutes"
        except Exception:
            return "Unknown"
    
    def get_docker_stats(self) -> Dict[str, Any]:
        """Get Docker container statistics."""
        self._get_docker_client()  # Ensure docker client is initialized
        if not self.docker_client:
            # Try to check if Docker is installed via command line
            docker_installed = self._check_docker_cli()
            return {
                "containers_running": 0,
                "containers_total": 0,
                "images_total": 0,
                "volumes_total": 0,
                "docker_version": "Docker not accessible" if not docker_installed else "Docker daemon not running",
                "container_stats": [],
                "docker_available": False,
                "docker_info": self._get_docker_info()
            }
        
        try:
            containers = self.docker_client.containers.list(all=True)
            running_containers = [c for c in containers if c.status == 'running']
            
            container_stats = []
            for container in running_containers:
                try:
                    stats = container.stats(stream=False)
                    
                    # Calculate CPU usage
                    cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - \
                               stats['precpu_stats']['cpu_usage']['total_usage']
                    system_delta = stats['cpu_stats']['system_cpu_usage'] - \
                                  stats['precpu_stats']['system_cpu_usage']
                    cpu_percent = 0.0
                    if system_delta > 0:
                        cpu_percent = (cpu_delta / system_delta) * 100.0
                    
                    # Calculate memory usage
                    mem_usage = stats['memory_stats']['usage']
                    mem_limit = stats['memory_stats']['limit']
                    mem_percent = (mem_usage / mem_limit) * 100 if mem_limit > 0 else 0
                    
                    container_stats.append({
                        "name": container.name,
                        "id": container.short_id,
                        "status": container.status,
                        "cpu_percent": round(cpu_percent, 2),
                        "memory_usage_mb": round(mem_usage / 1024 / 1024, 2),
                        "memory_limit_mb": round(mem_limit / 1024 / 1024, 2),
                        "memory_percent": round(mem_percent, 2)
                    })
                except Exception as e:
                    logger.error(f"Error getting stats for container {container.name}: {e}")
            
            return {
                "containers_running": len(running_containers),
                "containers_total": len(containers),
                "images_total": len(self.docker_client.images.list()),
                "volumes_total": len(self.docker_client.volumes.list()),
                "docker_version": self.docker_client.version()['Version'],
                "container_stats": container_stats,
                "docker_available": True,
                "docker_info": None
            }
        except Exception as e:
            logger.error(f"Error getting Docker stats: {e}")
            return {
                "containers_running": 0,
                "containers_total": 0,
                "images_total": 0,
                "volumes_total": 0,
                "docker_version": "Error",
                "container_stats": [],
                "docker_available": False,
                "docker_info": str(e)
            }
    
    def _check_docker_cli(self) -> bool:
        """Check if Docker CLI is installed."""
        try:
            result = subprocess.run(['docker', '--version'], capture_output=True, text=True, timeout=5)
            return result.returncode == 0
        except:
            return False
    
    def _get_docker_info(self) -> str:
        """Get information about Docker installation."""
        try:
            # Check if Docker is installed
            result = subprocess.run(['docker', '--version'], capture_output=True, text=True, timeout=5)
            if result.returncode != 0:
                return "Docker is not installed. Please install Docker Desktop."
            
            # Check if Docker daemon is running
            result = subprocess.run(['docker', 'info'], capture_output=True, text=True, timeout=5)
            if result.returncode != 0:
                if 'daemon' in result.stderr.lower() or 'docker desktop' in result.stderr.lower():
                    return "Docker is installed but the daemon is not running. Please start Docker Desktop."
                else:
                    return f"Docker error: {result.stderr}"
            
            return "Docker is running but Python cannot connect. Check permissions."
        except FileNotFoundError:
            return "Docker is not installed. Please install Docker Desktop from https://docker.com"
        except Exception as e:
            return f"Error checking Docker: {str(e)}"
    
    def get_process_stats(self) -> List[Dict[str, Any]]:
        """Get stats for key processes when Docker is not available - OPTIMIZED for minimal memory."""
        processes = []
        try:
            # Limit to only current process and immediate children to save memory
            psutil = self._get_psutil()
            current_pid = os.getpid()
            try:
                current_proc = psutil.Process(current_pid)
                processes.append({
                    'pid': current_pid,
                    'name': current_proc.name(),
                    'cpu_percent': round(current_proc.cpu_percent(interval=0.1) or 0, 2),
                    'memory_percent': round(current_proc.memory_percent() or 0, 2)
                })
                # Only get direct children to minimize memory usage
                for child in current_proc.children(recursive=False):
                    try:
                        processes.append({
                            'pid': child.pid,
                            'name': child.name(),
                            'cpu_percent': round(child.cpu_percent(interval=0.1) or 0, 2),
                            'memory_percent': round(child.memory_percent() or 0, 2)
                        })
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
            
            # Sort by memory usage
            processes.sort(key=lambda x: x['memory_percent'], reverse=True)
            return processes[:5]  # Return top 5 processes only (reduced from 10)
        except Exception as e:
            logger.error(f"Error getting process stats: {e}")
            return []
    
    def get_system_resources(self) -> Dict[str, Any]:
        """Get system resource usage."""
        try:
            psutil = self._get_psutil()
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # Memory usage
            memory = psutil.virtual_memory()
            
            # Disk usage
            disk = psutil.disk_usage('/')
            
            # Network I/O
            net_io = psutil.net_io_counters()
            
            return {
                "cpu_usage": round(cpu_percent, 1),
                "cpu_count": psutil.cpu_count(),
                "memory_usage": round(memory.percent, 1),
                "memory_total_gb": round(memory.total / (1024**3), 2),
                "memory_available_gb": round(memory.available / (1024**3), 2),
                "disk_usage": round(disk.percent, 1),
                "disk_total_gb": round(disk.total / (1024**3), 2),
                "disk_free_gb": round(disk.free / (1024**3), 2),
                "network_sent_mb": round(net_io.bytes_sent / (1024**2), 2),
                "network_recv_mb": round(net_io.bytes_recv / (1024**2), 2)
            }
        except Exception as e:
            logger.error(f"Error getting system resources: {e}")
            return {
                "cpu_usage": 0,
                "cpu_count": 0,
                "memory_usage": 0,
                "memory_total_gb": 0,
                "memory_available_gb": 0,
                "disk_usage": 0,
                "disk_total_gb": 0,
                "disk_free_gb": 0,
                "network_sent_mb": 0,
                "network_recv_mb": 0
            }
    
    def get_database_stats(self, db: Session) -> Dict[str, Any]:
        """Get database statistics."""
        try:
            # Get database file size
            db_path = DB_PATH
            db_size = os.path.getsize(db_path) if os.path.exists(db_path) else 0
            
            # Get table counts
            tables = ['users', 'workout_plans', 'meal_plans', 'nutrition_entries', 'progress_entries']
            table_counts = {}
            
            for table in tables:
                result = db.execute(text(f"SELECT COUNT(*) FROM {table}"))
                table_counts[table] = result.scalar()
            
            # Get active connections (SQLite doesn't really have this, so we'll estimate)
            active_connections = 1  # Current connection
            
            return {
                "database_size_mb": round(db_size / (1024**2), 2),
                "active_connections": active_connections,
                "table_counts": table_counts,
                "last_backup": self._get_last_backup_time()
            }
        except Exception as e:
            logger.error(f"Error getting database stats: {e}")
            return {
                "database_size_mb": 0,
                "active_connections": 0,
                "table_counts": {},
                "last_backup": "Unknown"
            }
    
    def _get_last_backup_time(self) -> str:
        """Get the last backup time."""
        # Check for backup files in a backup directory
        backup_dir = "backups"
        if os.path.exists(backup_dir):
            backup_files = [f for f in os.listdir(backup_dir) if f.endswith('.db')]
            if backup_files:
                latest_backup = max(backup_files, key=lambda f: os.path.getmtime(os.path.join(backup_dir, f)))
                backup_time = datetime.fromtimestamp(os.path.getmtime(os.path.join(backup_dir, latest_backup)))
                return backup_time.strftime("%Y-%m-%d %H:%M:%S")
        return "Never"
    
    def get_application_info(self) -> Dict[str, Any]:
        """Get application information."""
        return {
            "version": "1.2.0",
            "environment": os.getenv("ENVIRONMENT", "production"),
            "python_version": platform.python_version(),
            "platform": platform.platform(),
            "hostname": platform.node()
        }
    
    def get_recent_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent application logs."""
        logs = []
        log_file = "logs/elior_api.log"
        
        if os.path.exists(log_file):
            try:
                with open(log_file, 'r') as f:
                    lines = f.readlines()[-limit:]  # Get last 'limit' lines
                    
                for i, line in enumerate(lines):
                    if line.strip():
                        # Parse log line (assuming standard format)
                        parts = line.strip().split(' - ', 3)
                        if len(parts) >= 4:
                            timestamp = parts[0]
                            level = parts[1]
                            source = parts[2]
                            message = parts[3]
                        else:
                            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                            level = "INFO"
                            source = "system"
                            message = line.strip()
                        
                        logs.append({
                            "id": i + 1,
                            "timestamp": timestamp,
                            "level": level.lower(),
                            "message": message,
                            "source": source
                        })
            except Exception as e:
                logger.error(f"Error reading logs: {e}")
        
        return logs[-20:]  # Return last 20 logs
    
    def create_backup(self, db: Session) -> bool:
        """Create a database backup."""
        try:
            # Create backup directory if it doesn't exist
            backup_dir = "backups"
            os.makedirs(backup_dir, exist_ok=True)
            
            # Generate backup filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_file = os.path.join(backup_dir, f"elior_fitness_backup_{timestamp}.db")
            
            # Copy database file
            import shutil
            shutil.copy2(DB_PATH, backup_file)
            
            logger.info(f"Database backup created: {backup_file}")
            return True
        except Exception as e:
            logger.error(f"Error creating backup: {e}")
            return False
    
    def optimize_database(self, db: Session) -> bool:
        """Optimize the database."""
        try:
            # For SQLite, we can run VACUUM
            db.execute(text("VACUUM"))
            db.commit()
            logger.info("Database optimization completed")
            return True
        except Exception as e:
            logger.error(f"Error optimizing database: {e}")
            return False

# Create a singleton instance
system_service = SystemService() 