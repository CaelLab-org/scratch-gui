import hashlib, os, ssl, http.client

ROOT = r'C:\Users\yunyun\Desktop\server\codingcommunity'
FILES = [
    'app/views/partials/comment-thread.php',
    'public/assets/js/comments.js',
    'app/views/comments/show.php',
    'app/helpers/CommentHelper.php',
    'app/controllers/CommentController.php',
    'app/controllers/ProjectController.php',
    'app/controllers/UserController.php',
]

import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('154.64.254.97', port=56386, username='root', password='kZfOS7OphqYR2JZK', timeout=15)
B = '/www/wwwroot/coding.xmuer.online'

def run(cmd):
    _, o, e = ssh.exec_command(cmd)
    return o.read().decode('utf-8', 'replace').strip()

print('=== remote md5 ===')
for f in FILES:
    out = run('md5sum %s/%s 2>/dev/null; ls -l --time-style=+%%Y-%%m-%%d_%%H:%%M %s/%s' % (B, f, B, f))
    rem = out.splitlines()
    rmd5 = rem[0].split()[0] if rem else 'MISSING'
    rtime = rem[1].split()[-1] if len(rem) > 1 else '?'
    lp = os.path.join(ROOT, f.replace('/', os.sep))
    if os.path.exists(lp):
        lmd5 = hashlib.md5(open(lp, 'rb').read()).hexdigest()
        ltime = __import__('datetime').datetime.fromtimestamp(os.path.getmtime(lp)).strftime('%Y-%m-%d_%H:%M')
    else:
        lmd5, ltime = 'LOCAL-MISSING', '?'
    print('%-45s %s %s  remote=%s local=%s' % (f, 'SAME' if rmd5 == lmd5 else 'DIFF', rtime + '/' + ltime, rmd5[:8], lmd5[:8]))

# 线上作品页 HTML：看二级回复下有没有回复按钮
print('\n=== live project page ===')
try:
    ctx = ssl._create_unverified_context()
    c = http.client.HTTPSConnection('coding.xmuer.online', 443, timeout=20, context=ctx)
    c.request('GET', '/project/vor7rqzlg5tupg8cc32p', headers={'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity'})
    r = c.getresponse()
    html = r.read().decode('utf-8', 'replace')
    print('status', r.status, 'len', len(html))
    i = html.find('comments-list')
    seg = html[i:i+9000] if i >= 0 else ''
    print('has comments-list:', i >= 0)
    print('reply-item count:', seg.count('class="reply-item'))
    print('btn-reply count in comments area:', seg.count('btn-reply'))
    # 打印第一条二级回复附近的片段
    j = seg.find('reply-item')
    print('--- snippet around first reply-item ---')
    print(seg[j-200:j+1400] if j >= 0 else '(none)')
except Exception as ex:
    print('fetch failed:', ex)

ssh.close()
