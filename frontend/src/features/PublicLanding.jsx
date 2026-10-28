// @ts-check
import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bike,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Leaf,
  MapPin,
  Moon,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sun,
  Table2,
  UtensilsCrossed,
} from "lucide-react";
import { api } from "../api";
import { useWorkspaceTheme } from "../components/useWorkspaceTheme";
import "./publicLanding.css";

/** @typedef {{id:number,name:string,slug:string}} Category */
/** @typedef {{id:number,name:string,description?:string,image_url?:string|null,base_price:number|string,discount_percent?:number|string,category?:{name:string},variants?:Array<{id:number,name:string,price_adjustment:number|string}>}} PublicDish */
/** @typedef {{address?:string,name?:string,phone?:string,contact_email?:string,latitude?:number|string,longitude?:number|string,navigation_url?:string|null,is_active?:boolean,opening_hours?:Record<string,{open?:string,close?:string,closed?:boolean,all_day?:boolean}>}} RestaurantLocation */

const formatPrice = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});
const days = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** @param {{item:PublicDish|null,hero?:boolean}} props */
function RestaurantPhoto({ item, hero = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item?.image_url]);
  return (
    <div
      className={`public-food-photo${hero ? " public-food-photo--hero" : ""}${!item?.image_url || failed ? " public-food-photo--placeholder" : ""}`}
    >
      {item?.image_url && !failed ? (
        <img
          src={item.image_url}
          alt={hero ? item.name : ""}
          width="640"
          height="480"
          loading={hero ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="public-photo-placeholder">
          <UtensilsCrossed size={56} strokeWidth={1.25} aria-hidden="true" />
          {hero && <span>A little time for good food.</span>}
        </div>
      )}
    </div>
  );
}

/** The public endpoints expose configured weekly hours, but no authoritative timezone/open-now status.
 * Display those settings without inventing a live closing time.
 * @param {{location:RestaurantLocation|null}} props
 */
function OpeningHours({ location }) {
  const hours = location?.opening_hours;
  if (!hours || !Object.keys(hours).length) return null;
  return (
    <details className="public-hours">
      <summary>
        <Clock3 size={18} aria-hidden="true" />
        View restaurant hours
      </summary>
      <dl>
        {days
          .filter((day) => hours[day])
          .map((day) => {
            const window = hours[day];
            return (
              <div key={day}>
                <dt>{day.charAt(0).toUpperCase() + day.slice(1)}</dt>
                <dd>
                  {window.closed
                    ? "Closed"
                    : window.all_day
                      ? "All day"
                      : window.open && window.close
                        ? `${window.open}–${window.close}`
                        : "Contact us for hours"}
                </dd>
              </div>
            );
          })}
      </dl>
    </details>
  );
}

/** Public restaurant discovery uses live read-only endpoints. Ordering and reservations continue through authenticated routes.
 * @param {{onSignIn?:(destination:string)=>void}} props
 */
export function PublicLanding({ onSignIn }) {
  const { theme, toggleTheme } = useWorkspaceTheme();
  const [name, setName] = useState("DineFlow");
  const [location, setLocation] = useState(
    /** @type {RestaurantLocation|null} */ (null),
  );
  const [categories, setCategories] = useState(/** @type {Category[]} */ ([]));
  const [items, setItems] = useState(/** @type {PublicDish[]} */ ([]));
  const [hero, setHero] = useState(/** @type {PublicDish|null} */ (null));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [retry, setRetry] = useState(0);
  const searchId = useId();
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api("/restaurant/branding", { signal: controller.signal }),
      api("/restaurant/location", { signal: controller.signal }),
      api("/menu/categories", { signal: controller.signal }),
    ]).then((results) => {
      if (controller.signal.aborted) return;
      const [branding, outlet, groups] = results;
      if (branding.status === "fulfilled")
        setName(branding.value.data?.name || "DineFlow");
      if (outlet.status === "fulfilled") setLocation(outlet.value.data || null);
      if (groups.status === "fulfilled") setCategories(groups.value.data || []);
      setDetailsError(
        results.some((result) => result.status === "rejected")
          ? "Some restaurant details couldn’t refresh. You can still browse the menu."
          : "",
      );
    });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(
      async () => {
        try {
          const params = new URLSearchParams({
            available_only: "1",
            per_page: "6",
            page: String(page),
            ...(query.trim() ? { q: query.trim() } : {}),
            ...(category ? { category } : {}),
          });
          const result = await api(`/menu/items?${params}`, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          const dishes = /** @type {PublicDish[]} */ (result.data || []);
          setItems(dishes);
          setTotal(Number(result.total ?? dishes.length));
          setLastPage(Math.max(1, Number(result.last_page) || 1));
          if (!query.trim() && !category && page === 1)
            setHero(dishes.find((dish) => dish.image_url) || dishes[0] || null);
        } catch (failure) {
          if (!controller.signal.aborted)
            setError(
              failure instanceof Error ? failure.message : "Please try again.",
            );
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      query ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, category, page, retry]);
  /** Keep real destinations in links, including new-tab behavior.
   * @param {import('react').MouseEvent<HTMLAnchorElement>} event @param {string} destination
   */
  function signIn(event, destination) {
    if (
      !onSignIn ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onSignIn(destination);
  }
  const deliveryLabel =
    location?.is_active === false
      ? "Delivery currently paused"
      : location?.is_active === true
        ? "Delivery enabled · hours apply"
        : "Dine in, pickup & delivery";
  const navigation = location?.navigation_url?.startsWith("https://")
    ? location.navigation_url
    : null;
  const contactNumber = location?.phone?.replace(/[^\d+]/g, "");
  return (
    <div className="public-landing">
      <a href="#public-main" className="public-skip">
        Skip to restaurant content
      </a>
      <header className="public-header">
        <Link className="public-brand" to="/" aria-label={`${name} home`}>
          <span>
            <UtensilsCrossed size={25} aria-hidden="true" />
          </span>
          <div className="public-brand-identity">
            <strong>
              DineFlow<i>.</i>
            </strong>
            <span className="public-restaurant-name" title={name}>
              {name}
            </span>
          </div>
        </Link>
        <nav aria-label="Restaurant navigation">
          <a href="#public-menu">Our menu</a>
          <Link to="/reserve" onClick={(event) => signIn(event, "/reserve")}>
            Book a table
          </Link>
          <Link
            className="public-sign-in"
            to="/login"
            onClick={(event) => signIn(event, "/menu")}
          >
            Sign in
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <button
            type="button"
            className="public-theme-toggle"
            onClick={toggleTheme}
            aria-label={
              theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
            title={
              theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
          >
            {theme === "dark" ? (
              <Sun size={20} aria-hidden="true" />
            ) : (
              <Moon size={20} aria-hidden="true" />
            )}
          </button>
        </nav>
      </header>
      <main id="public-main" tabIndex={-1}>
        <section className="public-hero" aria-labelledby="public-title">
          <div className="public-hero-copy">
            <p className="public-eyebrow">
              <Leaf size={17} aria-hidden="true" />
              Made with care. Shared with joy.
            </p>
            <h1 id="public-title">
              Less waiting.
              <br />
              More savoring.
            </h1>
            <p>
              Good food brings people together. Find your next favorite, make
              time for a table, or let dinner come to you.
            </p>
            <div className="public-hero-actions">
              <a href="#public-menu" className="public-button">
                Explore menu
                <ArrowRight size={19} aria-hidden="true" />
              </a>
              <Link
                to="/reserve"
                className="public-button public-button--secondary"
                onClick={(event) => signIn(event, "/reserve")}
              >
                Book a table
                <Table2 size={19} aria-hidden="true" />
              </Link>
            </div>
            <div className="public-service-status">
              <span
                className={location?.is_active === false ? "is-paused" : ""}
                aria-hidden="true"
              />
              <span>{deliveryLabel}</span>
            </div>
          </div>
          <div className="public-hero-art">
            <RestaurantPhoto item={hero} hero />
            {hero && (
              <div className="public-feature-label">
                <span>From our kitchen</span>
                <strong>{hero.name}</strong>
                <span>
                  {formatPrice.format(Number(hero.base_price))} ·{" "}
                  {hero.category?.name || "Made to order"}
                </span>
              </div>
            )}
          </div>
        </section>
        <div className="public-promise-strip">
          <span>
            <UtensilsCrossed size={20} aria-hidden="true" />
            Fresh choices, made your way
          </span>
          <span>
            <Table2 size={20} aria-hidden="true" />A little time for good
            company
          </span>
          <span>
            <Bike size={20} aria-hidden="true" />
            Pickup & delivery
          </span>
        </div>
        <section
          id="public-menu"
          className="public-menu"
          aria-labelledby="public-menu-title"
        >
          <header className="public-section-heading">
            <div>
              <p className="public-eyebrow">Find a new favorite</p>
              <h2 id="public-menu-title">A little something to savor.</h2>
            </div>
            <p>
              Explore our current menu.
              <br />
              Sign in to choose your options and order.
            </p>
          </header>
          <div className="public-menu-toolbar">
            <div
              className="public-category-pills"
              role="group"
              aria-label="Menu categories"
            >
              <button
                type="button"
                aria-pressed={!category}
                onClick={() => {
                  setCategory("");
                  setPage(1);
                }}
              >
                All dishes
              </button>
              {categories.map((group) => (
                <button
                  type="button"
                  aria-pressed={category === group.slug}
                  key={group.id}
                  onClick={() => {
                    setCategory(group.slug);
                    setPage(1);
                  }}
                >
                  {group.name}
                </button>
              ))}
            </div>
            <label className="public-search" htmlFor={searchId}>
              <Search size={19} aria-hidden="true" />
              <span className="public-sr-only">Search menu</span>
              <input
                id={searchId}
                placeholder="Find your favorite"
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </label>
          </div>
          {loading ? (
            <div
              className="public-menu-skeleton"
              role="status"
              aria-label="Loading menu"
            >
              <span className="public-sr-only">Loading menu</span>
              {[0, 1, 2].map((index) => (
                <div key={index}>
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="public-state" role="alert">
              <UtensilsCrossed size={32} aria-hidden="true" />
              <h3>The menu couldn’t load</h3>
              <p>{error}</p>
              <button
                className="public-button public-button--secondary"
                type="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                <RefreshCw size={18} aria-hidden="true" />
                Try again
              </button>
            </div>
          ) : items.length ? (
            <>
              <div className="public-dish-grid">
                {items.map((item) => (
                  <article className="public-dish-card" key={item.id}>
                    <RestaurantPhoto item={item} />
                    <div className="public-dish-body">
                      <div>
                        <span className="public-eyebrow">
                          {item.category?.name || "From our kitchen"}
                        </span>
                        {Number(item.discount_percent) > 0 && (
                          <span className="public-offer">
                            {item.discount_percent}% off
                          </span>
                        )}
                      </div>
                      <h3>{item.name}</h3>
                      {item.description && <p>{item.description}</p>}
                      <footer>
                        <strong>
                          {formatPrice.format(Number(item.base_price))}
                        </strong>
                        <Link
                          className="public-button public-button--secondary"
                          to="/menu"
                          onClick={(event) => signIn(event, "/menu")}
                          aria-label={`Order ${item.name}`}
                        >
                          Order
                          <ArrowRight size={17} aria-hidden="true" />
                        </Link>
                      </footer>
                    </div>
                  </article>
                ))}
              </div>
              <div className="public-pagination">
                <p role="status" aria-live="polite">
                  Showing {Math.min((page - 1) * 6 + 1, total)}–
                  {Math.min(page * 6, total)} of {total} dishes
                </p>
                {lastPage > 1 && (
                  <nav aria-label="Menu pages">
                    <button
                      type="button"
                      className="public-icon-button"
                      aria-label="Previous menu page"
                      disabled={page <= 1}
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                    >
                      <ChevronLeft size={20} aria-hidden="true" />
                    </button>
                    <span>
                      Page {page} of {lastPage}
                    </span>
                    <button
                      type="button"
                      className="public-icon-button"
                      aria-label="Next menu page"
                      disabled={page >= lastPage}
                      onClick={() =>
                        setPage((value) => Math.min(lastPage, value + 1))
                      }
                    >
                      <ChevronRight size={20} aria-hidden="true" />
                    </button>
                  </nav>
                )}
              </div>
            </>
          ) : (
            <div className="public-state" role="status">
              <ShoppingBag size={34} aria-hidden="true" />
              <h3>
                {query || category
                  ? "No dishes match just yet"
                  : "The menu is getting ready"}
              </h3>
              <p>
                {query || category
                  ? "Try a different search or explore all dishes."
                  : "Check back soon for something delicious."}
              </p>
              <button
                type="button"
                className="public-button public-button--secondary"
                onClick={() => {
                  setQuery("");
                  setCategory("");
                  setPage(1);
                  setRetry((value) => value + 1);
                }}
              >
                {query || category ? "Show all dishes" : "Refresh menu"}
              </button>
            </div>
          )}
        </section>
        <section
          className="public-reserve-banner"
          aria-labelledby="public-reserve-title"
        >
          <div>
            <p className="public-eyebrow">Room for good company</p>
            <h2 id="public-reserve-title">Your evening starts with a table.</h2>
            <p>Choose your date, explore the floor plan, and find your spot.</p>
          </div>
          <Link
            to="/reserve"
            className="public-button"
            onClick={(event) => signIn(event, "/reserve")}
          >
            Plan your visit
            <ArrowRight size={19} aria-hidden="true" />
          </Link>
        </section>
        <section className="public-visit" aria-labelledby="public-visit-title">
          <div>
            <p className="public-eyebrow">A little closer to dinner</p>
            <h2 id="public-visit-title">Good food is within reach.</h2>
            <p>
              Choose delivery when you order. We’ll check your address, delivery
              area and current availability before confirming the fee.
            </p>
            <Link
              className="public-button public-button--secondary"
              to="/menu"
              onClick={(event) => signIn(event, "/menu")}
            >
              Start your order
              <Bike size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="public-address-card">
            <span className="public-address-icon">
              <MapPin size={27} aria-hidden="true" />
            </span>
            <h3>{name}</h3>
            {location?.address ? (
              <p>{location.address}</p>
            ) : (
              <p>Browse our menu or get in touch to plan your visit.</p>
            )}
            {navigation && (
              <a href={navigation} target="_blank" rel="noopener noreferrer">
                Get directions
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            )}
            {contactNumber && (
              <a href={`tel:${contactNumber}`}>
                <Phone size={16} aria-hidden="true" />
                {location?.phone}
              </a>
            )}
            <OpeningHours location={location} />
            {detailsError && (
              <p className="public-details-error" role="status">
                {detailsError}
                <button
                  type="button"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Refresh details
                </button>
              </p>
            )}
          </div>
        </section>
        <div className="public-sign-in-note">
          <ShieldCheck size={18} aria-hidden="true" />
          <p>
            Your orders and reservations stay in your own account.{" "}
            <Link to="/login" onClick={(event) => signIn(event, "/menu")}>
              Sign in to get started.
            </Link>
          </p>
        </div>
      </main>
      <footer className="public-footer">
        <Link className="public-brand" to="/">
          <UtensilsCrossed size={23} aria-hidden="true" />
          <strong>
            {name}
            <i>.</i>
          </strong>
        </Link>
        <p>Good food. Smooth operations.</p>
        <Link to="/login" onClick={(event) => signIn(event, "/menu")}>
          Sign in
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
