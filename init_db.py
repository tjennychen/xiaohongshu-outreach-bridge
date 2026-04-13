#!/usr/bin/env python3
"""Initialize the outreach SQLite database."""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "outreach.db")

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

c.execute("""
CREATE TABLE IF NOT EXISTS profiles (
    xhs_user_id TEXT,
    nickname TEXT,
    profile_url TEXT UNIQUE,
    followers INTEGER,
    location TEXT,
    email TEXT,
    bio TEXT,
    tags TEXT,
    tier TEXT,
    is_real_customer TEXT DEFAULT '?',
    classification_reason TEXT,
    status TEXT DEFAULT 'discovered',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
""")

c.execute("""
CREATE TABLE IF NOT EXISTS posts (
    profile_url TEXT,
    post_url TEXT UNIQUE,
    title TEXT,
    post_type TEXT,
    likes INTEGER,
    collects INTEGER,
    comments INTEGER,
    shares INTEGER,
    engagement INTEGER,
    is_commercial_post INTEGER DEFAULT 0,
    is_promo_post INTEGER DEFAULT 0,
    mentioned_brands TEXT,
    content_features TEXT,
    post_date TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_url) REFERENCES profiles(profile_url)
)
""")

c.execute("""
CREATE TABLE IF NOT EXISTS outreach (
    profile_url TEXT,
    post_url TEXT,
    comment_text TEXT,
    commented_at TIMESTAMP,
    got_reply INTEGER DEFAULT 0,
    reply_text TEXT,
    contact_info TEXT,
    status TEXT DEFAULT 'commented',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_url) REFERENCES profiles(profile_url)
)
""")

conn.commit()
conn.close()
print(f"DB initialized at {DB_PATH}")
