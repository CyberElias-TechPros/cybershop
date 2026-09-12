export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <span className="wordmark">
            Cyber<span>Shop</span>
          </span>
          <p>
            The night market that never closes. Find a business. Talk to it on
            WhatsApp — no checkout, no middlemen.
          </p>
        </div>
        <nav aria-label="Explore">
          <strong>Explore</strong>
          <a href="/businesses">Businesses</a>
          <a href="/search">Search</a>
          <a href="/cart">WhatsApp cart</a>
          <a href="/categories/academy">Academies</a>
          <a href="/categories/fashion">Fashion</a>
        </nav>
        <nav aria-label="Vendors">
          <strong>Vendors</strong>
          <a href="/register">Open a storefront</a>
          <a href="/login">Sign in</a>
          <a href="/onboarding">Choose a plan</a>
        </nav>
        <nav aria-label="House">
          <strong>House</strong>
          <a href="mailto:support@cybershop.ng">Support</a>
          <a href="/search">Ask the market</a>
          <span className="footer-hours">Always open · GMT+1</span>
        </nav>
      </div>
      <div className="footer-bar">
        <span>© {new Date().getFullYear()} CyberShop. Made for conversations.</span>
        <span className="footer-sig">Lagos · the continent · the chat</span>
      </div>
    </footer>
  );
}
