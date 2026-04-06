import re
import os

def rename_unused_catch_vars(content, debug=False):
    pattern = re.compile(r'catch\s*\(([a-zA-Z_][a-zA-Z0-9_]*)\)\s*\{')
    result = []
    i = 0
    replacements = 0
    while i < len(content):
        m = pattern.search(content, i)
        if not m:
            result.append(content[i:])
            break
        result.append(content[i:m.start()])
        var = m.group(1)
        if var.startswith('_'):
            result.append(m.group(0))
            i = m.end()
            continue
        brace_start = m.end() - 1
        depth = 1
        pos = brace_start + 1
        while pos < len(content) and depth > 0:
            if content[pos] == '{':
                depth += 1
            elif content[pos] == '}':
                depth -= 1
            pos += 1
        block_body = content[brace_start + 1:pos - 1]
        found = re.search(r'\b' + re.escape(var) + r'\b', block_body)
        if debug:
            line_num = content[:m.start()].count('\n') + 1
            print(f"  Line {line_num}: catch({var}), body={repr(block_body[:50])}, used={bool(found)}")
        if found:
            result.append(m.group(0))
            i = m.end()
        else:
            result.append(f'catch (_{var}) {{')
            i = m.end()
            replacements += 1
    return ''.join(result), replacements

target = r'C:\Users\fenix\Documents\code\ttrpg_system\apps\web-ui\src\lib\wasm\wasmIntegration.service.ts'
with open(target, encoding='utf-8') as f:
    content = f.read()

updated, n = rename_unused_catch_vars(content, debug=True)
print(f"Would rename {n} catch vars")
if n > 0 and updated != content:
    with open(target, 'w', encoding='utf-8') as f:
        f.write(updated)
    print("File updated")
