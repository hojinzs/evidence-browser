# Security Test

<script>alert('xss')</script>

<iframe src="https://evil.example.com"></iframe>

<img src="x" onerror="alert('xss')">

[정상 링크](normal-file.txt)

[Path traversal 시도](../../../etc/passwd)
