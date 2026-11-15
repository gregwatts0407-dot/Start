#!/usr/bin/env python3
import glob, os, subprocess, sys, base64, re
here=os.path.dirname(os.path.abspath(__file__)); out=os.path.join(here,"dist"); os.makedirs(out,exist_ok=True)
files=sorted(glob.glob(os.path.join(here,"manuscript","*.md")))
body="\n\n".join(open(f,encoding="utf-8").read().strip() for f in files)+"\n"
md=os.path.join(out,"novel.md"); open(md,"w",encoding="utf-8").write(body)
print("words:",len(re.sub(r"[{}#:*]"," ",body).split()))
frag=subprocess.run(["pandoc",md,"-f","markdown+smart+fenced_divs+header_attributes","-t","html5","--toc","--toc-depth=2","-s","--template",os.path.join(here,"tmpl.html")],capture_output=True,text=True,check=True).stdout
css=open(os.path.join(here,"book.css")).read()
for k,f in [("FONT400N","400-normal"),("FONT400I","400-italic"),("FONT600N","600-normal"),("FONT600I","600-italic")]:
    b=base64.b64encode(open(os.path.join(here,"fonts",f"eb-garamond-latin-{f}.woff2"),"rb").read()).decode()
    css=css.replace(k,"data:font/woff2;base64,"+b)
html=frag.replace("/*CSS*/",css)
hp=os.path.join(out,"The-Same-Night-Seven-Ways.html"); open(hp,"w",encoding="utf-8").write(html)
if "--docx" in sys.argv or "--all" in sys.argv:
    subprocess.run(["pandoc",md,"-f","markdown+smart+fenced_divs+header_attributes","--toc","--toc-depth=2",
      "--metadata","title=The Same Night, Seven Ways","--metadata","subtitle=A Novel","--metadata","toc-title=Contents",
      "--reference-doc",os.path.join(here,"ref.docx"),"-o",os.path.join(out,"The-Same-Night-Seven-Ways.docx")],check=True)
if "--pdf" in sys.argv or "--all" in sys.argv:
    subprocess.run(["node",os.path.join(here,"pdf.js"),hp,os.path.join(out,"The-Same-Night-Seven-Ways.pdf")],check=True)
