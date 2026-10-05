import hashlib, os, paramiko

ROOT = r'C:\Users\yunyun\Desktop\server\codingcommunity'
B = '/www/wwwroot/codingcommunity'
FILES = [
    'app/views/partials/comment-thread.php',
    'public/assets/js/comments.js',
    'app/views/comments/show.php',
    'app/helpers/CommentHelper.php',
    'app/controllers/CommentController.php',
    'app/controllers/ProjectController.php',
    'app/controllers/UserController.php',
]
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('154.64.254.97', port=56386, username='root', password='kZfOS7OphqYR2JZK', timeout=15)

def run(cmd):
    _, o, e = ssh.exec_command(cmd)
    return o.read().decode('utf-8', 'replace').strip()

print('=== md5 compare ===')
for f in FILES:
    out = run('md5sum %s/%s 2>/dev/null' % (B, f))
    rmd5 = out.split()[0] if out else 'MISSING'
    lp = os.path.join(ROOT, f.replace('/', os.sep))
    lmd5 = hashlib.md5(open(lp, 'rb').read()).hexdigest() if os.path.exists(lp) else 'LOCAL-MISSING'
    print('%-45s %s  remote=%s local=%s' % (f, 'SAME' if rmd5 == lmd5 else 'DIFF', rmd5[:10], lmd5[:10]))

# 回复接口那道 parent 校验还在不在
print('\n=== ProjectController::reply ===')
print(run("grep -n 'parent_id\\|只能回复\\|level\\|MAX_DEPTH' %s/app/controllers/ProjectController.php | head -40" % B))
print('\n=== CommentController::reply / show 关键行 ===')
print(run("grep -n 'threadComposer\\|composer\\|parent_id\\|render\\|function ' %s/app/controllers/CommentController.php | head -60" % B))
print('\n=== show.php (评论页) ===')
print(run("grep -n 'threadComposer\\|composer' %s/app/views/comments/show.php" % B))
print('\n=== 作品页调 partial 的地方 ===')
print(run("grep -rn 'comment-thread' %s/app/views/ --include=*.php" % B))
ssh.close()
