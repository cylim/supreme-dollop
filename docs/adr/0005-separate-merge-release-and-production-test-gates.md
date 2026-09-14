# Separate merge, release, and production test gates

JRNY Plan uses a deterministic merge gate without a cloud deployment, a release gate on a disposable Convex preview deployment, and a read-only production check. This split keeps pull-request feedback under eight minutes while reserving browser, migration, performance, and real integration checks for an isolated environment. GitHub Actions enforces the gates, and protected environments separate release and production secrets from pull-request code.
