# Instagram → Galerie

Pull photos from the trip Instagram account into the gallery, with one click or on a
schedule.

## How it works

GitHub does the fetching, not your browser. A workflow calls Instagram, downloads any new
media into `photos/`, rebuilds `data/photos.json` and commits. GitHub Pages redeploys on
the push, and the photos appear.

The access token lives in a **GitHub Actions secret** — encrypted, never in the repo.
That matters: this repo is public, so a token committed here would be readable by anyone,
and anything the page could read, so could they.

Downloading rather than embedding also means:

- **The photos are permanent.** Instagram's media URLs are signed and expire; linking to
  them would leave the gallery quietly rotting.
- **They work offline**, through the service worker. Relevant on Rügen.
- **No Meta scripts** on the site. No cookies, no tracking, nothing external.
- If the Instagram account is ever deleted, the photos stay.

---

## Before you start

**The account must be Creator or Business.** A personal account will not work. The old
Basic Display API — the easy one — was shut down by Meta on 4 December 2024, and its
replacement only serves professional accounts.

To convert: Instagram app → **Settings → Account type and tools → Switch to professional
account → Creator**. It's free, reversible, and does not make the account public by
itself.

You will need about 20 minutes and a Facebook account to sign in to the developer site.

---

## Step 1 — Create a Meta app

1. Go to <https://developers.facebook.com/apps/> and sign in.
2. **Create app**.
3. App name: `Ostsee Extravaganza`. Contact email: yours.
4. For the use case, choose the one about **Instagram** — the wording changes, but you
   want the option that mentions accessing Instagram data, not "Facebook Login" on its own.
5. Create the app. You'll land on its dashboard.

## Step 2 — Add Instagram

1. In the left sidebar, find **Instagram** → **API setup with Instagram login**.
   (If you only see "Add product", add **Instagram** from that list first.)
2. Under **Generate access tokens**, click **Add account** and log in with the trip
   Instagram account. Approve the permissions it asks for.
3. Back on that screen you should now see the account listed.

You want the permission called `instagram_business_basic`. Reading your *own* account
while the app is in Development mode does not normally need Meta's app review — you are
the owner and a test user of your own app.

## Step 3 — Get a long-lived token

The setup screen gives you a token directly — look for **Generate token** next to the
account. Copy it.

That token is short-lived (about an hour). Turn it into a 60-day one:

```bash
curl -s "https://graph.instagram.com/access_token\
?grant_type=ig_exchange_token\
&client_secret=YOUR_APP_SECRET\
&access_token=THE_SHORT_TOKEN"
```

The app secret is on the app dashboard under **App settings → Basic**. The response looks
like:

```json
{ "access_token": "IGAA...", "token_type": "bearer", "expires_in": 5183944 }
```

`expires_in` is seconds — about 60 days. **That long `IGAA...` string is what you need.**

> If the setup screen already offers a long-lived token, you can skip the exchange. Check
> it with the command in step 5.

## Step 4 — Put the token in the repository secret

1. Repo → **Settings → Secrets and variables → Actions**.
2. **New repository secret**.
3. Name: **`IG_TOKEN`** — exactly that, it is case-sensitive.
4. Value: the long `IGAA...` token.
5. **Add secret**.

GitHub encrypts it. You cannot read it back afterwards, only replace it — that is the
point.

## Step 5 — Test it

Locally, if you want to check before involving GitHub:

```bash
IG_TOKEN='IGAA...' python3 tools/instagram.py --check
```

That prints the account name, type and how many posts it can see. It writes nothing.

Then on GitHub: **Actions → Instagram → Galerie → Run workflow**. Watch it run. The
summary at the end says how many files it pulled.

## Step 6 — Use it

- **The button.** The Galerie page has a **Neue Bilder holen** button once the first sync
  has run. It opens the workflow page; press **Run workflow** there.
- **On its own.** It also runs twice a day, at about 07:23 and 19:23 German summer time.
  So mostly you post to Instagram and the site catches up without you.
- Pages takes a minute or two to redeploy after the workflow pushes.

---

## Things worth knowing

**The token expires after 60 days.** One issued at the start of August lasts past the end
of September, so it comfortably covers the trip. If you ever need to renew:

```bash
IG_TOKEN='IGAA...' python3 tools/instagram.py --refresh
```

That prints a fresh token; paste it into the `IG_TOKEN` secret. It only works on a token
that is at least 24 hours old and not yet expired. If it has lapsed, redo steps 2–4.

The workflow does **not** renew the token by itself. It could, but only with a second
credential that can write repository secrets, and for a nine-day trip that is more moving
parts than the problem deserves.

**Anything you post there becomes public here, permanently.** The repo is public and git
history is forever — deleting a post from Instagram later will not remove the photo from
this repo. Post to that account accordingly.

**Captions come across too**, and show under each photo along with a small link back to
the original post. They live in `data/instagram.json` and survive a manifest rebuild.

**Carousels** are unpacked into their individual photos. **Videos** are pulled if they are
under 40 MB; anything larger is skipped with a note, and you can compress it and drop it
into `photos/` by hand.

**Photos are filed by the date you posted them**, so they land on the right trip day
automatically — as long as you post on the day. Post a Zingst photo three days later and
it lands in the wrong group; move the file and re-run `python3 tools/fotos.py`.

---

## If it goes wrong

| What you see | What it means |
|---|---|
| `IG_TOKEN secret is not set` | Step 4 did not take, or the name is misspelled |
| `Instagram rejected the request` | Token expired, or the account is still personal |
| `does not look like a Creator/Business account` | Convert it — see *Before you start* |
| Workflow runs, finds nothing | Nothing new posted since the last sync — that is a pass |
| Photos appear but in the wrong day group | Posted on a different day than taken; move and re-run `tools/fotos.py` |

Nothing here is load-bearing. If Meta changes the rules again, the fallback still works
and always will: export from Instagram, drop the files into `photos/2026-09-02/`, run
`python3 tools/fotos.py`, commit.
