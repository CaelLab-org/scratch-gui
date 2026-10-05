import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('154.64.254.97', port=56386, username='root', password='kZfOS7OphqYR2JZK', timeout=15)

def run(cmd):
    _, o, e = ssh.exec_command(cmd)
    return o.read().decode('utf-8', 'replace').strip()

print(run("ls /www/wwwroot | head -40"))
print('--- find comment-thread.php ---')
print(run("find /www/wwwroot -maxdepth 5 -name comment-thread.php 2>/dev/null"))
print('--- vhost ---')
print(run("grep -rl 'coding.xmuer.online' /www/server/panel/vhost/nginx/ 2>/dev/null | head"))
ssh.close()
