#!/usr/bin/env python3
"""Assemble the manuscript into HTML, PDF and DOCX."""
import glob, os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, "dist"); os.makedirs(out, exist_ok=True)
files = sorted(glob.glob(os.path.join(here, "manuscript", "*.md")))
front = """---
title: "The Same Night, Seven Ways"
subtitle: "A Novel"
lang: en-GB
---

"""
body = front + "\n\n".join(open(f, encoding="utf-8").read().strip() for f in files) + "\n"
md = os.path.join(out, "novel.md"); open(md, "w", encoding="utf-8").write(body)
words = len(body.split()); print("words:", words)
css = os.path.join(here, "book.css")
html = os.path.join(out, "The-Same-Night-Seven-Ways.html")
subprocess.run(["pandoc", md, "-f", "markdown+smart+fenced_divs", "-t", "html5", "-s",
                "--css", css, "--embed-resources", "--toc", "--toc-depth=1",
                "--metadata", "toc-title=Contents", "-o", html], check=True)
if "--docx" in sys.argv or "--all" in sys.argv:
    subprocess.run(["pandoc", md, "-f", "markdown+smart+fenced_divs", "-o",
                    os.path.join(out, "The-Same-Night-Seven-Ways.docx")], check=True)
if "--pdf" in sys.argv or "--all" in sys.argv:
    js = os.path.join(here, "pdf.js")
    subprocess.run(["node", js, html, os.path.join(out, "The-Same-Night-Seven-Ways.pdf")], check=True)
