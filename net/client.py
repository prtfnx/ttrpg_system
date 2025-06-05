import sys
import threading
import socket

SERVER_HOST = "127.0.0.1"
SERVER_PORT = 12345


def run_server():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind((SERVER_HOST, SERVER_PORT))
    server.listen()
    print(f"Server listening on {SERVER_HOST}:{SERVER_PORT}")

    while True:
        client, addr = server.accept()
        print(f"Client connected from {addr}")
        threading.Thread(target=handle_client, args=(client,)).start()
def handle_client(client):
    while True:
        data = client.recv(1024)
        if not data:
            break
        print(f"Received from client: {data.decode()}")
        client.sendall(b"ACK: " + data)
    client.close()

def run_client():
    client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    client.connect((SERVER_HOST, SERVER_PORT))
    print(f"Connected to server at {SERVER_HOST}:{SERVER_PORT}")

    def recv_thread():
        while True:
            data = client.recv(1024)
            if not data:
                break
            print(f"Received from server: {data.decode()}")

    threading.Thread(target=recv_thread, daemon=True).start()

    while True:
        msg = input("Send to server: ")
        if msg.lower() == "quit":
            break
        client.sendall(msg.encode())
    client.close()

if __name__ == "__main__":
    # Usage: python client.py server   (to start server)
    #        python client.py          (to start client)
    if len(sys.argv) > 1 and sys.argv[1] == "server":
        run_server()
    else:
        try:
            run_client()
        except ConnectionRefusedError:
            print("Error: Could not connect to server. Make sure the server is running first.")