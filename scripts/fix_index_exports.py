import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

packages_dirs = [
    'packages/core',
    'packages/protocol',
    'packages/storage',
    'packages/lsm',
    'packages/raft',
    'packages/cluster',
    'packages/scheduler',
    'packages/worker',
    'packages/gateway',
    'packages/client',
    'packages/chaos',
    'packages/sql',
    'packages/telemetry',
    'packages/security',
    'packages/network'
]

for p in packages_dirs:
    src_dir = os.path.join(base_dir, p, 'src')
    if not os.path.exists(src_dir):
        continue
    
    exports = []
    for f in os.listdir(src_dir):
        if f.endswith('.js') and f != 'index.js':
            exports.append(f"export * from './{f}';")
    
    index_file = os.path.join(src_dir, 'index.js')
    with open(index_file, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(sorted(exports)) + '\n')
    print(f"Updated index.js in {p}/src/index.js ({len(exports)} modules exported)")

print("All index.js exports reconciled successfully.")
