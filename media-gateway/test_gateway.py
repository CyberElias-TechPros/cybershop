#!/usr/bin/env python3
"""Real PHP HTTP tests, no Worker, provider credentials or production files.

  python3 media-gateway/test_gateway.py
  PHP_COMMAND='npx --yes --package=@php-wasm/cli@3.1.60 php-wasm-cli' python3 media-gateway/test_gateway.py

PHP's development server does not enforce Apache .htaccess: host hardening and
Worker->PHP->finalize acceptance still need staging E2E tests.
"""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import shlex
import shutil
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent
SECRET = 'synthetic-test-gateway-secret-not-for-production'
ORIGIN = 'https://cybershop.ng'


class GatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='cybershop-gateway-')
        cls.directory = Path(cls.temp.name)
        shutil.copy(ROOT / 'upload.php', cls.directory / 'upload.php')
        config = (ROOT / 'config.example.php').read_text().replace('change-me-shared-secret-at-least-32-chars', SECRET)
        (cls.directory / 'config.php').write_text(config)
        # Real JPEG rather than the old smoke script's truncated JFIF header.
        cls.jpeg = (ROOT.parent / 'scripts/seed-demo/logo.jpg').read_bytes()
        with socket.socket() as port_socket:
            port_socket.bind(('127.0.0.1', 0))
            port = port_socket.getsockname()[1]
        cls.url = f'http://127.0.0.1:{port}'
        cls.log = tempfile.TemporaryFile()
        command = shlex.split(os.environ.get('PHP_COMMAND', 'php'))
        cls.server = subprocess.Popen(command + ['-S', f'127.0.0.1:{port}', '-t', str(cls.directory)], stdout=cls.log, stderr=cls.log, start_new_session=True)
        try:
            for _ in range(200):
                if cls.server.poll() is not None:
                    raise RuntimeError('PHP server exited during startup')
                try:
                    cls.call('/upload.php', method='GET')
                    return
                except (OSError, TimeoutError):
                    time.sleep(0.1)
            raise RuntimeError('PHP server startup timed out')
        except Exception:
            cls.tearDownClass()
            raise

    @classmethod
    def tearDownClass(cls):
        if cls.server.poll() is None:
            # This process group was created above; never kill unrelated listeners.
            import signal
            os.killpg(cls.server.pid, signal.SIGTERM)
            try:
                cls.server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(cls.server.pid, signal.SIGKILL)
                cls.server.wait(timeout=5)
        cls.log.close()
        cls.temp.cleanup()

    @classmethod
    def call(cls, path, data=None, method='POST', headers=None):
        request = urllib.request.Request(cls.url + path, data=data, method=method, headers=headers or {})
        try:
            response = urllib.request.urlopen(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.code, response.headers, response.read()

    def token(self, expired=False, maximum=1024 * 1024):
        payload = json.dumps({'t': uuid.uuid4().hex, 'b': 1, 'e': int(time.time()) + (-60 if expired else 600), 'm': maximum, 'p': 'media/vendors/1/catalogue/'}, separators=(',', ':')).encode()
        encoded = base64.urlsafe_b64encode(payload).rstrip(b'=').decode()
        return encoded + '.' + hmac.new(SECRET.encode(), encoded.encode(), hashlib.sha256).hexdigest()

    def upload(self, key=None, content=None, token=None, origin=ORIGIN):
        key = key or f'media/vendors/1/catalogue/{uuid.uuid4().hex}.jpg'
        content = self.jpeg if content is None else content
        boundary = 'CyberShopTest' + uuid.uuid4().hex
        body = b''
        for name, value in [('token', token or self.token()), ('key', key)]:
            body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="upload.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'.encode() + content
        body += f'\r\n--{boundary}--\r\n'.encode()
        return self.call('/upload.php', body, headers={'Content-Type': f'multipart/form-data; boundary={boundary}', 'Origin': origin})

    def test_missing_configuration_fails_closed(self):
        config = self.directory / 'config.php'
        saved = self.directory / 'saved-config.php'
        config.rename(saved)
        try:
            self.assertEqual(self.upload()[0], 503)
        finally:
            saved.rename(config)

    def test_placeholder_secret_fails_closed(self):
        config = self.directory / 'config.php'
        original = config.read_text()
        config.write_text(original.replace(SECRET, 'change-me-placeholder-secret-not-for-production'))
        try:
            self.assertEqual(self.upload()[0], 503)
        finally:
            config.write_text(original)

    def test_missing_origin_configuration_fails_closed(self):
        config = self.directory / 'config.php'
        original = config.read_text()
        config.write_text(original.replace("const ALLOWED_ORIGINS = ['https://cybershop.ng'];", ''))
        try:
            self.assertEqual(self.upload()[0], 503)
        finally:
            config.write_text(original)

    def test_actual_upload_and_public_serve(self):
        status, headers, body = self.upload()
        self.assertEqual(status, 200, body)
        data = json.loads(body)
        self.assertTrue(data['ok'])
        file = self.directory / data['storage_key']
        self.assertTrue(file.is_file())
        self.assertEqual(file.stat().st_size, data['size_bytes'])
        self.assertEqual(headers['Access-Control-Allow-Origin'], ORIGIN)
        served, _, contents = self.call('/' + data['storage_key'], method='GET')
        self.assertEqual(served, 200)
        self.assertEqual(contents, file.read_bytes())

    def test_receipt_authenticates_the_actual_stored_bytes(self):
        token = self.token()
        status, _, body = self.upload(token=token)
        self.assertEqual(status, 200, body)
        data = json.loads(body)
        encoded, signature = data['receipt'].split('.')
        expected = hmac.new(SECRET.encode(), ('media-receipt.v1:' + encoded).encode(), hashlib.sha256).hexdigest()
        self.assertTrue(hmac.compare_digest(signature, expected))
        receipt = json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)))
        original = json.loads(base64.urlsafe_b64decode(token.split('.')[0] + '=' * (-len(token.split('.')[0]) % 4)))
        self.assertEqual(receipt['t'], original['t'])
        self.assertEqual(receipt['expires_at'], original['e'])
        self.assertEqual(receipt['size'], (self.directory / data['storage_key']).stat().st_size)
        self.assertEqual(receipt['sha256'], hashlib.sha256((self.directory / data['storage_key']).read_bytes()).hexdigest())
        self.assertGreater(receipt['width'], 0)
        self.assertGreater(receipt['height'], 0)

    def test_rejects_truncated_image_even_with_a_matching_magic_header(self):
        self.assertEqual(self.upload(content=b'\xff\xd8\xffbad-image')[0], 415)

    def test_preflight_is_explicit_and_has_no_credentials(self):
        status, headers, _ = self.call('/upload.php', method='OPTIONS', headers={'Origin': ORIGIN})
        self.assertEqual(status, 204)
        self.assertEqual(headers['Access-Control-Allow-Origin'], ORIGIN)
        self.assertIsNone(headers.get('Access-Control-Allow-Credentials'))

    def test_untrusted_origin(self):
        self.assertEqual(self.upload(origin='https://evil.invalid')[0], 403)

    def test_get_is_not_an_upload(self):
        self.assertEqual(self.call('/upload.php', method='GET')[0], 405)

    def test_invalid_signature(self):
        self.assertEqual(self.upload(token=self.token() + 'bad')[0], 403)

    def test_expired_signature(self):
        self.assertEqual(self.upload(token=self.token(expired=True))[0], 410)

    def test_tenant_boundary(self):
        self.assertEqual(self.upload(key='media/vendors/2/catalogue/foreign.jpg')[0], 403)

    def test_signed_folder_scope(self):
        self.assertEqual(self.upload(key='media/vendors/1/branding/wrong-folder.jpg')[0], 403)

    def test_traversal(self):
        self.assertEqual(self.upload(key='media/vendors/1/../outside.jpg')[0], 400)

    def test_mime_and_extension_mismatch(self):
        self.assertEqual(self.upload(content=b'not a JPEG')[0], 415)
        self.assertEqual(self.upload(key='media/vendors/1/catalogue/fake.php')[0], 415)

    def test_size_limit_and_empty(self):
        self.assertEqual(self.upload(token=self.token(maximum=4))[0], 413)
        self.assertEqual(self.upload(content=b'')[0], 400)

    def test_no_overwrite(self):
        key = f'media/vendors/1/catalogue/{uuid.uuid4().hex}.jpg'
        self.assertEqual(self.upload(key=key)[0], 200)
        self.assertEqual(self.upload(key=key)[0], 409)


if __name__ == '__main__':
    unittest.main(verbosity=2)
