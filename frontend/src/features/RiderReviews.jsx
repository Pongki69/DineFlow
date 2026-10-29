import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Star } from "lucide-react";
import { RiderVehicle } from "../components/RiderVehicle";
import { RiderScreenSkeleton } from "../components/RiderScreenSkeleton";
import { api } from "../api";
import { Button, Feedback, PageHeader } from "../components/ui";
import { RatingStars, reviewCategories } from "../components/RiderReviewForm";
import "../components/riderReviews.css";

export function RiderReviews({ own = false }) {
  const { riderId } = useParams();
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(1),
    [filterRating, setFilterRating] = useState(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setPage(1);
    setFilterRating(null);
  }, [riderId, own]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ page: String(page) });
    if (filterRating != null) query.set("rating", String(filterRating));
    api(
      own ? `/rider/reviews?${query}` : `/riders/${riderId}/profile?${query}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result.data);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [riderId, own, page, filterRating, retry]);
  function toggleRatingFilter(stars) {
    setPage(1);
    setFilterRating((current) => (current === stars ? null : stars));
  }
  return (
    <section className="rider-public-profile">
      <PageHeader
        title={own ? "Ratings & reviews" : "Rider profile"}
        description={
          own
            ? data?.summary?.demo_count > 0
              ? "Preview feedback from sample deliveries."
              : "Feedback from verified deliveries."
            : undefined
        }
      />
      {loading ? (
        <RiderScreenSkeleton variant="reviews" label="Loading rider profile" />
      ) : error ? (
        <Feedback onRetry={() => setRetry((value) => value + 1)}>
          {error}
        </Feedback>
      ) : (
        data && (
          <>
            {data.summary.demo_count > 0 && (
              <p className="review-demo-notice" role="status">
                <strong>Demo reviews enabled.</strong> This preview includes{" "}
                {data.summary.demo_count} sample reviews. They are generated
                test feedback, not customer endorsements.
              </p>
            )}
            <section
              className="review-profile-header"
              aria-label="Rider information"
            >
              <div className="review-rider-avatar" aria-hidden="true">
                {data.rider.name.slice(0, 1)}
              </div>
              <div>
                <h2>{data.rider.name}</h2>
                <div>
                  <RiderVehicle type={data.rider.vehicle_type} />
                </div>
                <small>
                  {data.rider.joined_at
                    ? `Joined ${new Date(`${data.rider.joined_at}-01T00:00:00`).toLocaleDateString([], { month: "long", year: "numeric" })}`
                    : ""}
                </small>
              </div>
              <span className="review-delivery-count">
                <CheckCircle2 size={18} aria-hidden="true" />
                {data.rider.delivered_total} delivered
              </span>
            </section>
            {Number(data.summary?.count || 0) === 0 ? (
              <div className="review-profile-layout review-profile-layout-empty">
                <section
                  className="review-summary-card"
                  aria-label="Rating summary"
                >
                  <h2 className="review-summary-label">Overall rating</h2>
                  <div className="review-scoreline">
                    <strong>—</strong>
                    <span>/ 5</span>
                  </div>
                  <RatingStars value={0} />
                  <p>No ratings yet</p>
                  <div className="review-distribution">
                    {data.summary.breakdown.map((row) => (
                      <div key={row.stars}>
                        <span>{row.stars} ★</span>
                        <progress
                          max={1}
                          value={0}
                          aria-label={`${row.stars} star reviews: 0`}
                        />
                        <span>0</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section
                  className="review-first-empty"
                  aria-labelledby="review-first-heading"
                >
                  <div className="review-first-empty-icon" aria-hidden="true">
                    <Star size={29} strokeWidth={1.7} />
                  </div>
                  <div className="review-first-empty-copy">
                    <span>WHAT TO EXPECT</span>
                    <h2 id="review-first-heading">
                      Your first review will appear here
                    </h2>
                    <p>
                      {data.rider.delivered_total > 0
                        ? "Customers can leave a review after a completed delivery. Your verified rating and comments will appear here once they submit one."
                        : "Complete your first delivery to open your review history. Customers can then leave feedback about their experience."}
                    </p>
                  </div>
                  <div className="review-first-empty-progress">
                    <strong>{data.rider.delivered_total}</strong>
                    <span>completed deliveries</span>
                  </div>
                </section>
              </div>
            ) : (
              <div className="review-profile-layout">
                <section
                  className="review-summary-card"
                  aria-label="Rating summary"
                >
                  <h2 className="review-summary-label">Overall rating</h2>
                  <div className="review-scoreline">
                    <strong>{Number(data.summary.average).toFixed(1)}</strong>
                    <span>/ 5</span>
                  </div>
                  <RatingStars
                    value={Math.round(Number(data.summary.average || 0))}
                  />
                  <p>
                    {data.summary.count}{" "}
                    {data.summary.demo_count > 0 ? "" : "verified "}
                    {data.summary.count === 1 ? "review" : "reviews"}
                  </p>
                  <div className="review-distribution">
                    {data.summary.breakdown.map((row) => (
                      <button
                        className={
                          filterRating === row.stars
                            ? "review-distribution-row is-active"
                            : "review-distribution-row"
                        }
                        key={row.stars}
                        type="button"
                        aria-pressed={filterRating === row.stars}
                        aria-label={`Show ${row.stars}-star reviews, ${row.count} reviews`}
                        onClick={() => toggleRatingFilter(row.stars)}
                      >
                        <span>{row.stars} ★</span>
                        <progress
                          max={Math.max(1, data.summary.count)}
                          value={row.count}
                          aria-label={`${row.stars} star reviews: ${row.count}`}
                        />
                        <span>{row.count}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="review-list" aria-label="Customer reviews">
                  <header className="review-list-heading">
                    <div>
                      <h2>Customer reviews</h2>
                      {filterRating != null && (
                        <span className="review-filter-label">
                          {filterRating}-star reviews
                        </span>
                      )}
                    </div>
                    <div className="review-list-actions">
                      <span>
                        {data.meta.total}{" "}
                        {data.summary.demo_count > 0 ? "" : "verified "}
                        {data.meta.total === 1 ? "review" : "reviews"}
                      </span>
                      {filterRating != null && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setFilterRating(null);
                            setPage(1);
                          }}
                        >
                          Clear filter
                        </Button>
                      )}
                    </div>
                  </header>
                  {data.reviews.length ? (
                    data.reviews.map((review) => (
                      <article className="review-card" key={review.id}>
                        <div className="review-card-heading">
                          <strong>{review.display_name}</strong>
                          <time dateTime={review.created_at}>
                            {new Date(review.created_at).toLocaleDateString()}
                          </time>
                        </div>
                        <RatingStars value={review.rating} />
                        <span className="review-verified">
                          {review.is_demo
                            ? "Demo delivery"
                            : "Verified delivery"}
                        </span>
                        <div className="review-tags">
                          {review.categories.map((category) => (
                            <span key={category}>
                              {reviewCategories[category] || category}
                            </span>
                          ))}
                        </div>
                        {review.comment && (
                          <p className="review-comment">{review.comment}</p>
                        )}
                      </article>
                    ))
                  ) : (
                    <p className="review-filter-empty">
                      No {filterRating}-star reviews yet.
                    </p>
                  )}
                  {data.meta.last_page > 1 ? (
                    <nav
                      className="workspace-pagination"
                      aria-label="Review pages"
                    >
                      <Button
                        variant="secondary"
                        disabled={page <= 1}
                        onClick={() => setPage((value) => value - 1)}
                      >
                        Previous
                      </Button>
                      <span>
                        {page} / {data.meta.last_page}
                      </span>
                      <Button
                        variant="secondary"
                        disabled={page >= data.meta.last_page}
                        onClick={() => setPage((value) => value + 1)}
                      >
                        Next
                      </Button>
                    </nav>
                  ) : null}
                </section>
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
