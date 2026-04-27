# new


I wonder if there is ANY point haveing a web folder and if we should just move that code and e2e into the worker folder ?


the thing i am strugglng with is that for a cloudflare project we also have gui and that has config. like a react gui etc etc. in a wrangler project we always have gui so then i dont know the best way

---


Yeah this is the real tension. A CF Worker project with a GUI has two distinct things:

```
worker code    → Hono routes, business logic
static assets  → React/JS GUI, served by the worker
```

Wrangler handles this via static assets:

```toml
# wrangler.toml
name = "my-worker"
main = "src/index.ts"

[assets]
directory = "./dist"   # built React app goes here
```

But the GUI needs its own build step and potentially its own dev server with HMR. That's where the friction is — wrangler dev doesn't give you fast React HMR out of the box.

So the question for your setup is which of these fits:

**Option A — Vite + CF Vite plugin**
```
vite dev  → serves GUI with HMR + wrangler worker together
```
CF has a first-class Vite plugin that runs wrangler and Vite together. Hot reload works. This is what most CF+React projects use now.

**Option B — Wrangler static assets**
```
bun run build   → builds React into dist/
wrangler dev    → serves dist/ as static assets
```
No HMR, have to rebuild on every change. Fine for non-GUI-heavy work.

**Option C — Separate ports**
```
vite dev    → :5173 React with HMR
wrangler dev → :8787 API only
```
Proxy from Vite to wrangler. Classic split but two processes.

