import os
import zipfile

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
zip_path = os.path.join(base_dir, 'Krono-Distributed-Platform.zip')

if os.path.exists(zip_path):
    os.remove(zip_path)

print("Creating submission zip archive (including .git, excluding node_modules/dist)...")

count = 0
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(base_dir):
        # Exclude node_modules, dist, build, coverage, and any existing zip files
        if any(x in root for x in ['node_modules', 'dist', 'build', 'coverage', '.system_generated']):
            continue
        
        for f in files:
            if f.endswith('.zip') or f.endswith('.log'):
                continue
            
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, base_dir)
            zipf.write(full_path, rel_path)
            count += 1

size_kb = os.path.getsize(zip_path) / 1024
print(f"Created {zip_path} with {count} files ({size_kb:.1f} KB)")
