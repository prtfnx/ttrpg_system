import re

v = 'e'
s = ' /* best-effort */ '
result = bool(re.search(r'\b' + re.escape(v) + r'\b', s))
print("match in comment:", result)

s2 = ' /* ok */ '
result2 = bool(re.search(r'\b' + re.escape(v) + r'\b', s2))
print("match in ok:", result2)
