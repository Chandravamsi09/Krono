import os
import sys

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def write_f(rel_path, content):
    p = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"Generated: {rel_path}")

# Fix root and all package.json licenses to UNLICENSED
import json
for root, dirs, files in os.walk(base_dir):
    if any(x in root for x in ['node_modules', '.git', 'dist', 'build']):
        continue
    for f in files:
        if f == 'package.json':
            fp = os.path.join(root, f)
            try:
                with open(fp, 'r', encoding='utf-8') as fh:
                    data = json.load(fh)
                data['license'] = 'UNLICENSED'
                data['private'] = True
                with open(fp, 'w', encoding='utf-8') as fh:
                    json.dump(data, fh, indent=2)
            except Exception as e:
                pass

print("License update complete.")
