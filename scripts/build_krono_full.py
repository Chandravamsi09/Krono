import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def write_mod(rel_path, content):
    full = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"Generated: {rel_path}")

# Fix root package.json license to UNLICENSED (Proprietary)
# and fix all package.json licenses
