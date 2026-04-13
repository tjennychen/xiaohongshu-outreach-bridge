import subprocess
import time

print("Move mouse around. Ctrl+C to stop.\n")
try:
    while True:
        r = subprocess.run(['/opt/homebrew/bin/cliclick', 'p:.'], capture_output=True, text=True)
        print(r.stdout.strip())
        time.sleep(1)
except KeyboardInterrupt:
    print("Done.")
