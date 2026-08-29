import os
import re

base_dir = '.'
ignore_dirs = ['node_modules', '.git', 'dist', 'coverage', '.system_generated']

def scan_files():
    all_files = []
    for root, dirs, files in os.walk(base_dir):
        if any(ig in root for ig in ignore_dirs):
            continue
        for f in files:
            all_files.append(os.path.join(root, f))
    return all_files

files = scan_files()

license_patterns = [
    (r'mit\s+license', 'MIT License reference'),
    (r'apache\s+license', 'Apache License reference'),
    (r'\bgpl\b|\bagpl\b|\blgpl\b|gnu\s+general', 'GPL/Copyleft reference')
]

secret_patterns = [
    (r'(api[_-]?key|secret[_-]?key|auth[_-]?token|access[_-]?token|private[_-]?key)\s*[:=]\s*[\'\"][a-zA-Z0-9_\-\.]{12,}[\'\"]', 'Hardcoded Secret'),
    (r'password\s*[:=]\s*[\'\"][a-zA-Z0-9_\-\.]{6,}[\'\"]', 'Hardcoded Password'),
    (r'-----BEGIN\s+(RSA|EC|DSA|OPENSSH|PRIVATE)\s+KEY-----', 'Private Key Header')
]

findings = []
for fp in files:
    if fp.endswith(('.zip', '.png', '.jpg', '.ico')): continue
    try:
        with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
            lines = fh.readlines()
            for line_no, line in enumerate(lines, 1):
                for pat, label in license_patterns:
                    if re.search(pat, line, re.IGNORECASE):
                        findings.append((label, fp, line_no, line.strip()[:100]))
                for pat, label in secret_patterns:
                    if re.search(pat, line, re.IGNORECASE):
                        findings.append((label, fp, line_no, line.strip()[:100]))
    except Exception as e:
        pass

print(f'Total findings: {len(findings)}')
for label, fp, line_no, snippet in findings:
    print(f'[{label}] {fp}:{line_no} -> {snippet}')
