
import os

file_path = 'components/proforma/Phase3.tsx'

with open(file_path, 'r') as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

# Find the block start (VAL.ADU complex logic)
for i, line in enumerate(lines):
    if 'const valAdu = Number(val.valorAduanaUSD || 0);' in line and 'const impPrPag' in lines[i+1]:
        # found the start of the logic block inside the IIFE
        # We want to remove the IIFE wrapper too: {(() => { ... })()}
        # The IIFE start is likely 1 line above this.
        if '{(() => {' in lines[i-1]:
            start_idx = i - 1
            break

if start_idx != -1:
    # Find the end of the IIFE
    for j in range(start_idx, len(lines)):
        if '})()' in lines[j]:
            end_idx = j
            break

if start_idx != -1 and end_idx != -1:
    print(f"Found block at lines {start_idx+1} to {end_idx+1}")
    
    # Construct new content
    # We preserve indentation of the start_line
    indent = lines[start_idx][:lines[start_idx].find('{')]
    
    new_block = [
        f'{indent}<div className="text-right text-[9px]">\n',
        f'{indent}    ${{val.valorAduanaUSD}}\n',
        f'{indent}</div>\n'
    ]
    
    # Replace lines
    new_lines = lines[:start_idx] + new_block + lines[end_idx+1:]
    
    with open(file_path, 'w') as f:
        f.writelines(new_lines)
    print("Successfully patched Phase3.tsx")
else:
    print("Could not find the target block in Phase3.tsx")
