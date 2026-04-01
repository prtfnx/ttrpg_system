"""
Audit logging utilities for invitation and admin systems
"""
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from server_host.database import models
from server_host.utils.logger import setup_logger

logger = setup_logger(__name__)

def extract_client_info(request) -> Dict[str, Optional[str]]:
    """
    Extract client information from request for audit logging
    
    Args:
        request: FastAPI Request object
        
    Returns:
        Dict containing ip_address and user_agent
    """
    # Try to get real IP from X-Forwarded-For header (for reverse proxies)
    ip_address = None
    if hasattr(request, 'headers') and 'x-forwarded-for' in request.headers:
        # Take the first IP from the chain (client IP)
        forwarded_ips = request.headers['x-forwarded-for'].split(',')
        ip_address = forwarded_ips[0].strip()
    elif hasattr(request, 'client') and hasattr(request.client, 'host'):
        ip_address = request.client.host
    
    # Get user agent
    user_agent = None
    if hasattr(request, 'headers') and 'user-agent' in request.headers:
        user_agent = request.headers['user-agent']
    
    return {
        'ip_address': ip_address,
        'user_agent': user_agent
    }

def format_audit_details(event_type: str, event_data: Dict[str, Any]) -> str:
    """
    Format audit log details in a consistent way
    
    Args:
        event_type: Type of event being logged
        event_data: Data associated with the event
        
    Returns:
        str: Formatted details string
    """
    details = f"Event: {event_type}"
    
    for key, value in event_data.items():
        # Sanitize sensitive information
        if key.lower() in ['password', 'token', 'secret']:
            value = '[REDACTED]'
        
        details += f", {key}: {value}"
    
    return details

def create_audit_log(
    db: Session,
    event_type: str,
    session_code: Optional[str] = None,
    user_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[str] = None,
    additional_data: Optional[Dict[str, Any]] = None
) -> models.AuditLog:
    """
    Create an audit log entry
    
    Args:
        db: Database session
        event_type: Type of event (e.g., 'invitation_created')
        session_code: Session code if applicable
        user_id: User ID if applicable  
        ip_address: Client IP address
        user_agent: Client user agent
        details: Event details
        additional_data: Additional data to include in details
        
    Returns:
        AuditLog: The created audit log entry
    """
    # Format details if additional_data provided
    if additional_data and not details:
        details = format_audit_details(event_type, additional_data)
    elif additional_data and details:
        formatted_additional = format_audit_details("additional", additional_data)
        details = f"{details}; {formatted_additional}"
    
    audit_log = models.AuditLog(
        event_type=event_type,
        session_code=session_code,
        user_id=user_id,
        ip_address=ip_address,
        user_agent=user_agent,
        details=details or f"Event: {event_type}"
    )
    
    db.add(audit_log)
    
    try:
        db.commit()
        logger.info(f"Audit log created: {event_type} for user {user_id} in session {session_code}")
    except Exception as e:
        logger.error(f"Failed to create audit log: {e}")
        db.rollback()
        raise
    
    return audit_log

def filter_audit_logs(logs: List[Dict[str, Any]], 
                     event_types: Optional[List[str]] = None,
                     session_code: Optional[str] = None,
                     user_id: Optional[int] = None,
                     start_date: Optional[datetime] = None,
                     end_date: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """
    Filter audit logs by various criteria
    
    Args:
        logs: List of audit log dictionaries
        event_types: Filter by event types
        session_code: Filter by session code
        user_id: Filter by user ID
        start_date: Filter by start date
        end_date: Filter by end date
        
    Returns:
        List[Dict]: Filtered audit logs
    """
    filtered_logs = logs.copy()
    
    if event_types:
        filtered_logs = [log for log in filtered_logs 
                        if log.get('event_type') in event_types]
    
    if session_code:
        filtered_logs = [log for log in filtered_logs 
                        if log.get('session_code') == session_code]
    
    if user_id:
        filtered_logs = [log for log in filtered_logs 
                        if log.get('user_id') == user_id]
    
    if start_date:
        filtered_logs = [log for log in filtered_logs 
                        if log.get('timestamp') and 
                        datetime.fromisoformat(log['timestamp'].replace('Z', '+00:00')) >= start_date]
    
    if end_date:
        filtered_logs = [log for log in filtered_logs 
                        if log.get('timestamp') and 
                        datetime.fromisoformat(log['timestamp'].replace('Z', '+00:00')) <= end_date]
    
    return filtered_logs

def get_audit_summary(db: Session, session_code: str, days: int = 30) -> Dict[str, Any]:
    """
    Get audit summary for a session
    
    Args:
        db: Database session
        session_code: Session to get summary for
        days: Number of days to look back
        
    Returns:
        Dict: Audit summary statistics
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    logs = db.query(models.AuditLog).filter(
        models.AuditLog.session_code == session_code,
        models.AuditLog.timestamp >= cutoff_date
    ).all()
    
    # Count by event type
    event_counts = {}
    for log in logs:
        event_counts[log.event_type] = event_counts.get(log.event_type, 0) + 1
    
    # Get unique users
    unique_users = set()
    for log in logs:
        if log.user_id:
            unique_users.add(log.user_id)
    
    return {
        'total_events': len(logs),
        'event_types': event_counts,
        'unique_users': len(unique_users),
        'date_range_days': days,
        'session_code': session_code
    }

def log_invitation_event(db: Session, event_type: str, invitation: models.SessionInvitation, 
                        user_id: int, request=None, additional_details: str = "") -> None:
    """
    Helper to log invitation-related events
    
    Args:
        db: Database session
        event_type: Type of event
        invitation: Invitation model instance
        user_id: User performing the action
        request: FastAPI request object (optional)
        additional_details: Additional details to log
    """
    client_info = extract_client_info(request) if request else {}
    
    details = f"Invitation {invitation.invite_code} - Role: {invitation.pre_assigned_role}"
    if additional_details:
        details += f" - {additional_details}"
    
    create_audit_log(
        db=db,
        event_type=event_type,
        session_code=invitation.session.session_code if invitation.session else None,
        user_id=user_id,
        ip_address=client_info.get('ip_address'),
        user_agent=client_info.get('user_agent'),
        details=details
    )

def log_session_management_event(db: Session, event_type: str, session_code: str,
                                target_user_id: int, admin_user_id: int, request=None, 
                                additional_details: str = "") -> None:
    """
    Helper to log session management events
    
    Args:
        db: Database session
        event_type: Type of event
        session_code: Session where event occurred
        target_user_id: User being acted upon
        admin_user_id: Admin performing the action
        request: FastAPI request object (optional)
        additional_details: Additional details to log
    """
    client_info = extract_client_info(request) if request else {}
    
    details = f"Target User: {target_user_id}, Admin User: {admin_user_id}"
    if additional_details:
        details += f" - {additional_details}"
    
    create_audit_log(
        db=db,
        event_type=event_type,
        session_code=session_code,
        user_id=admin_user_id,
        ip_address=client_info.get('ip_address'),
        user_agent=client_info.get('user_agent'),
        details=details
    )