import logging
import sys

# Global flag to track if logging is configured
_logging_configured = False

def setup_logger(name='myapp', level=logging.DEBUG):
    """Set up logger with consistent formatting across modules"""
    global _logging_configured
    
    # Configure root logger to avoid duplicates
    root_logger = logging.getLogger()
    
    # Clear existing handlers to prevent duplicates
    if not _logging_configured:
        root_logger.handlers.clear()
        
        # Set up root logger
        root_logger.setLevel(level)
        
        # Create console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(level)
        
        # Create formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        console_handler.setFormatter(formatter)
        
        # Add handler to root logger
        root_logger.addHandler(console_handler)
        
        # Mark as configured
        _logging_configured = True
    
    # Return named logger that will use root logger's configuration
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    return logger