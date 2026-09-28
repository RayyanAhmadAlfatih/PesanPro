# Trusted reverse-proxy policy

PesanPro uses the client IP for authentication rate limits, API-key IP allowlists, and audit metadata. Those controls are only meaningful when forwarding headers come from a trusted ingress.

## Single aaPanel/Nginx proxy

For the common deployment:

```text
Internet -> Nginx/aaPanel -> PesanPro Node process
```

set:

```env
TRUSTED_PROXY_HOPS=1
```

and make Nginx **overwrite**, rather than preserve, client-supplied forwarding values:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
```

The PesanPro Node port must not be reachable directly from the internet. Bind it to loopback/private networking or enforce the equivalent firewall rule.

## More than one trusted proxy

If there are additional trusted hops such as a managed edge proxy in front of Nginx, set `TRUSTED_PROXY_HOPS` to the number of trusted hops and make sure the first trusted public edge sanitizes incoming forwarding headers.

PesanPro walks `X-Forwarded-For` from the right according to that hop count. It does not blindly trust the first value.

## No trusted reverse proxy

Set:

```env
TRUSTED_PROXY_HOPS=0
```

Forwarding headers are then ignored and the application returns `unknown` as the header-derived client IP. Do not use IP allowlists in that configuration until the runtime has a trusted peer-address source.
