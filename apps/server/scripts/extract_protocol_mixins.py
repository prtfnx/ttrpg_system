"""Retired one-time migration; the protocol mixins are maintained directly."""


def main() -> None:
    raise SystemExit(
        "This migration is retired. service/server_protocol.py is now a compatibility "
        "shim; extracting its old line ranges would overwrite the live protocol. "
        "Edit service/protocol/ directly."
    )


if __name__ == "__main__":
    main()
