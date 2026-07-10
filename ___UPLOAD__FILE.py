import os
import time

print("🚀 Elite Paper Auto-Uploader Started...")

print("⏳ Adding new files...")
os.system('git add .')

print("💾 Committing data...")
commit_msg = f"Paper Update - {time.strftime('%Y-%m-%d %I:%M %p')}"
os.system(f'git commit -m "{commit_msg}"')

print("☁️ Uploading to GitHub... (Please wait)")
os.system('git push')

print("✅ Successfully Uploaded! (Zero Lag)")