import os
import sys

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def write_file(rel_path, content):
    full_path = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"Written: {rel_path}")

print("Generator script template ready.")
