set -eu
sudo mkdir -p '/opt/wenyan' /var/lib/wenyan
sudo chown -R $(id -un):$(id -gn) '/opt/wenyan' /var/lib/wenyan
tar -xzf '/tmp/wenyan-deploy.tar.gz' -C '/opt/wenyan'
cd '/opt/wenyan'
npm ci
npm run build
sudo install -m 0644 deploy/wenyan.service /etc/systemd/system/wenyan.service
sudo sed -i "s/REPLACE_WITH_SERVER_USER/$(id -un)/" /etc/systemd/system/wenyan.service
sudo systemctl daemon-reload
sudo systemctl enable wenyan
# 蹇呴』鐢?restart锛歟nable --now 鍦ㄦ湇鍔″凡杩愯鏃朵笉浼氶噸鍚畠锛屼細瀵艰嚧鏂颁唬鐮佷笉鐢熸晥
sudo systemctl restart wenyan
curl --fail http://127.0.0.1:8878/api/health