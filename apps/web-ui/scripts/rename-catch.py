import re
import os

def rename_unused_catch_vars(content):
    pattern = re.compile(r'catch\s*\(([a-zA-Z_][a-zA-Z0-9_]*)\)\s*\{')
    result = []
    i = 0
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
        if re.search(r'\b' + re.escape(var) + r'\b', block_body):
            result.append(m.group(0))
            i = m.end()
        else:
            result.append(f'catch (_{var}) {{')
            i = m.end()
    return ''.join(result)

changed = 0
src_dir = os.path.join(os.path.dirname(__file__), '..', 'src')
for root, dirs, files in os.walk(src_dir):
    dirs[:] = [d for d in dirs if d not in ['node_modules', 'dist']]
    for fn in files:
        if not fn.endswith(('.ts', '.tsx')):
            continue
        path = os.path.join(root, fn)
        with open(path, encoding='utf-8') as f:
            original = f.read()
        updated = rename_unused_catch_vars(original)
        if updated != original:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(updated)
            changed += 1
            print(f'  Updated: {os.path.relpath(path, src_dir)}')

print(f'Modified {changed} files')
