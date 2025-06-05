# TTRPG Webhook Server for Render.com

This is a FastAPI-based HTTP/webhook server for the TTRPG system, designed to be deployed on render.com or other cloud platforms.

## Features

- HTTP/webhook-based client communication
- Table management and synchronization
- Sprite/entity updates and movement
- File serving for game resources
- Client registration and authentication
- Real-time multiplayer support via webhooks

## API Endpoints

### Server Status
- `GET /` - Server status and information
- `GET /health` - Health check endpoint

### Client Management
- `POST /api/client/register` - Register webhook client
- `POST /api/client/unregister` - Unregister client
- `GET /api/clients` - List connected clients

### Messaging
- `POST /api/message` - Receive message from client
- `POST /api/ping` - Handle client ping

### Tables
- `GET /api/tables` - List available tables
- `GET /api/table/{table_name}` - Get specific table data
- `POST /api/table/create` - Create new table

## Deployment on Render.com

1. **Push to Git Repository**
   ```bash
   git add server_host/
   git commit -m "Add webhook server for render.com"
   git push origin main
   ```

2. **Create New Web Service on Render.com**
   - Connect your GitHub repository
   - Choose "Web Service"
   - Set Build Command: `cd server_host && pip install -r requirements.txt`
   - Set Start Command: `cd server_host && python main.py`
   - Set Environment Variables:
     - `PYTHON_VERSION`: `3.10.0`
   - Set Health Check Path: `/health`

3. **Configure Custom Domain (Optional)**
   - Add your custom domain in render.com dashboard
   - Update client configurations to use your domain

## Local Testing

1. **Install Dependencies**
   ```bash
   cd server_host
   pip install -r requirements.txt
   ```

2. **Run Server**
   ```bash
   python main.py
   ```

3. **Test Server**
   ```bash
   python test_webhook_server.py http://localhost:8000
   ```

## Client Configuration

Update your TTRPG client to use webhook connection:

```bash
python main.py --connection webhook --server-url https://your-app.onrender.com
```

## Environment Variables

- `PORT` - Server port (automatically set by render.com)
- `PYTHON_VERSION` - Python version for deployment

## File Structure

```
server_host/
├── __init__.py              # Package initialization
├── main.py                  # FastAPI application entry point
├── webhook_server.py        # Main webhook server logic
├── webhook_protocol.py      # Protocol handler for webhooks
├── table_manager.py         # Table management system
├── requirements.txt         # Python dependencies
├── render.yaml             # Render.com configuration
├── test_webhook_server.py  # Test suite
└── README.md               # This file
```

## Dependencies

- FastAPI - Web framework
- uvicorn - ASGI server
- aiohttp - HTTP client for webhook calls
- aiofiles - Async file operations

## Troubleshooting

1. **Server won't start**: Check the logs in render.com dashboard
2. **Client can't connect**: Verify the server URL and webhook endpoints
3. **Messages not received**: Check webhook URL accessibility
4. **Performance issues**: Monitor server resources in render.com

## Security Considerations

- Add authentication for production use
- Configure CORS settings appropriately
- Use HTTPS in production
- Validate all incoming data
- Rate limit API endpoints

## Support

For issues and questions, check the main TTRPG system repository.
