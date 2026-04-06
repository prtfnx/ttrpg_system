"""Fix no-useless-escape violations in auth.service.ts and RealTimeCombatSystem.test.tsx"""
import re

def fix_file(path, replacements):
    content = open(path, encoding='utf-8').read()
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            print(f"Fixed in {path}")
        else:
            print(f"NOT FOUND: {repr(old[:40])} in {path}")
    open(path, 'w', encoding='utf-8').write(content)

# auth.service.ts: /error[\"']: [\"']([^\"']+)[\"']/i  -- \" is useless inside character class
# The actual bytes have \" inside [] which is unnecessary
auth_path = r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\features\auth\services\auth.service.ts'
content = open(auth_path, encoding='utf-8').read()
# Replace the pattern where \" appears inside regex character class
new_content = content.replace(
    r'/error[\"\']: [\"\']([\^\"\']+)[\"\']/i',
    r"/error[\"']: [\"']([^\"']+)[\"']/i"
)

# Direct byte-level check
print("Lines 53-54:")
lines = content.splitlines()
print(repr(lines[52]))
print(repr(lines[53]))

# The actual regex in the file: /error[\"']: [\"']([^\"']+)[\"']/i
# The \" inside [] is the problem. In a regex literal, you don't need to escape "
# Fix: replace \" with " inside character classes in this specific pattern
import re as re_mod
fixed = re_mod.sub(
    r'/error\[\\"\'\\]: \[\\"\'\\]\(\[\\^\\"\\'\\]\+\)\[\\"\'\\]/i',
    r"/error[\"']: [\"']([^\"']+)[\"']/i",
    content
)
if fixed != content:
    print("Fixed with regex")
    open(auth_path, 'w', encoding='utf-8').write(fixed)
else:
    print("Regex didn't match, trying direct approach")
    # Print bytes around line 54
    line = lines[53]
    print("Bytes:", [hex(ord(c)) for c in line[:80]])
