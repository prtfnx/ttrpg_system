"""
Script to extract ServerProtocol methods into domain mixin files.
Run from the apps/server/ directory or the repo root.
"""
import pathlib

ROOT = pathlib.Path(__file__).parent.parent  # apps/server/
SRC = ROOT / "service" / "server_protocol.py"
OUT_DIR = ROOT / "service" / "protocol"
OUT_DIR.mkdir(exist_ok=True)

lines = SRC.read_text(encoding="utf-8").splitlines()


def extract(start: int, end: int) -> str:
    """1-indexed inclusive line extraction."""
    return "\n".join(lines[start - 1 : end])


IMPORTS = '''\
import os
import sys
import time
import json
import uuid
import xxhash
from typing import Dict, Set, Optional, Tuple, Any, Callable, TYPE_CHECKING

from core_table.protocol import Message, MessageType, BatchMessage
from core_table.actions_core import ActionsCore
from utils.logger import setup_logger
from utils.roles import is_dm, is_elevated, can_interact, get_visible_layers, get_sprite_limit
from database.models import Asset, GameSession, GamePlayer
from database.database import SessionLocal
from service.movement_validator import MovementValidator, Combatant
from service.rules_engine import RulesEngine
from core_table.session_rules import SessionRules
from core_table.game_mode import GameMode
from database.crud import get_session_rules_json, get_game_mode

if TYPE_CHECKING:
    pass

logger = setup_logger(__name__)
'''

# Each domain: name -> flat list of [start, end, start, end, ...]
DOMAINS: dict[str, list[int]] = {
    "sprites": [
        316, 428, 430, 463, 465, 617, 619, 662, 664, 715,
        717, 734, 736, 753, 755, 772, 1209, 1367,
        1372, 1486, 1488, 1508, 1510, 1534, 2953, 2991,
    ],
    "tables": [
        774, 803, 805, 822, 824, 887, 889, 964, 966, 1100, 1102, 1207,
        2803, 2828, 2830, 2856, 3051, 3079, 3081, 3106, 3108, 3142,
    ],
    "assets": [
        1369, 1371, 1538, 1594, 1596, 1645, 1647, 1659, 1661, 1706,
        1708, 1743, 1745, 1759, 1762, 1826, 1829, 1839, 1841, 1853,
        1882, 1924, 1926, 1962, 3020, 3048,
    ],
    "players": [
        2190, 2218, 2220, 2261, 2263, 2306, 2308, 2334,
        2336, 2340, 2342, 2344, 2346, 2347, 2349, 2350,
        2859, 2883, 2885, 2906, 2908, 2929, 2931, 2950, 2994, 3017,
    ],
    "characters": [
        2356, 2409, 2411, 2451, 2453, 2489, 2491, 2535,
        2537, 2584, 2586, 2602, 2604, 2626, 2628, 2703, 2705, 2749,
        2126, 2186,
    ],
    "auth": [2764, 2770, 2772, 2778, 2780, 2785, 2787, 2793, 2795, 2800],
    "walls": [3203, 3230, 3232, 3256, 3258, 3281, 3283, 3311, 3313, 3354],
    "session": [
        3356, 3394, 3398, 3429, 3431, 3467, 3469, 3501,
        3144, 3168, 3170, 3197,
    ],
    "combat": [
        3505, 3526, 3528, 3537, 3539, 3548, 3550, 3565, 3567, 3583,
        3585, 3603, 3605, 3620, 3622, 3649, 3651, 3665,
        3669, 3701, 3703, 3723, 3727, 3741, 3743, 3763,
        3765, 3775, 3777, 3791, 3793, 3807, 3809, 3831, 3833, 3855,
        3857, 3872, 3874, 3898, 3900, 3918, 3920, 3935, 3937, 3962,
        3966, 3967, 3969, 3986, 3988, 4001, 4003, 4008,
        4010, 4057, 4064, 4087, 4089, 4134, 4192, 4312,
    ],
    "encounter": [4136, 4152, 4154, 4164, 4166, 4176, 4178, 4188],
    "helpers": [
        1855, 1858, 1860, 1867, 1869, 1874, 1876, 1880,
        1964, 1984, 1986, 2021, 2023, 2041, 2043, 2124,
        2755, 2761,
    ],
}

for domain, ranges in DOMAINS.items():
    assert len(ranges) % 2 == 0, f"{domain} has odd range list"
    method_blocks = [extract(ranges[i], ranges[i + 1]) for i in range(0, len(ranges), 2)]
    class_name = f"_{domain.title()}Mixin"
    content = IMPORTS + f'\n\nclass {class_name}:\n    """Handler methods for {domain} domain."""\n'
    for block in method_blocks:
        content += "\n" + block + "\n"
    out = OUT_DIR / f"{domain}.py"
    out.write_text(content, encoding="utf-8")
    print(f"Wrote {out.relative_to(ROOT)} ({len(method_blocks)} method blocks)")

# Write __init__.py that re-exports ServerProtocol from the parent module
(OUT_DIR / "__init__.py").write_text(
    "# Domain mixin files for ServerProtocol\n"
    "# Import ServerProtocol from service.server_protocol\n"
    "from ..server_protocol import ServerProtocol\n\n"
    "__all__ = ['ServerProtocol']\n",
    encoding="utf-8",
)
print("Wrote service/protocol/__init__.py")
