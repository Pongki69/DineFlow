import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Star } from "lucide-react";
import { RiderVehicle } from "../components/RiderVehicle";
import { api } from "../api";
import {
  Button,
  EmptyState,
  Feedback,
  PageHeader,
  Skeleton,
} from "../components/ui";
import { RatingStars, reviewCategories } from "../components/RiderReviewForm";
import "../components/riderReviews.css";

export function RiderReviews({ own = false }) {
  const { riderId } = useParams();
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setPage(1);
  }, [riderId, own]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api(
      own
        ? `/rider/reviews?page=${page}`
        : `/riders/${riderId}/profile?page=${page}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setData(result.data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [riderId, own, page, retry]);
  return (
    <section className="rider-public-profile">
      {own && (
        <Link className="rider-page-link rider-back-link" to="/rider">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to dashboard
        </Link>
      )}
      <PageHeader
        eyebrow={own ? "CUSTOMER FEEDBACK" : "YOUR DELIVERY PARTNER"}
        title={own ? "Ratings & reviews" : "Rider profile"}
        description={own ? "Feedback from verified deliveries." : undefined}
      />
      {loading ? (
        <Skeleton label="Loading rider profile" />
      ) : error ? (
        <Feedback onRetry={() => setRetry((value) => value + 1)}>
          {error}
        </Feedback>
      ) : (
        data && (
          <>
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
            <div className="review-profile-layout">
              <section
                className="review-summary-card"
                aria-label="Rating summary"
              >
                <Star size={24} aria-hidden="true" />
                <strong>
                  {data.summary.count
                    ? Number(data.summary.average).toFixed(1)
                    : "—"}
                  <small> / 5</small>
                </strong>
                <RatingStars
                  value={Math.round(Number(data.summary.average || 0))}
                />
                <p>
                  {data.summary.count} verified{" "}
                  {data.summary.count === 1 ? "review" : "reviews"}
                </p>
                <div className="review-distribution">
                  {data.summary.breakdown.map((row) => (
                    <div key={row.stars}>
                      <span>{row.stars} ★</span>
                      <progress
                        max={Math.max(1, data.summary.count)}
                        value={row.count}
                        aria-label={`${row.stars} star reviews: ${row.count}`}
                      />
                      <span>{row.count}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="review-list" aria-label="Customer reviews">
                {!data.reviews.length && (
                  <EmptyState
                    title="No reviews yet"
                    description="Reviews appear after completed deliveries."
                  />
                )}
                {data.reviews.map((review) => (
                  <article className="review-card" key={review.id}>
                    <div className="review-card-heading">
                      <strong>{review.display_name}</strong>
                      <time dateTime={review.created_at}>
                        {new Date(review.created_at).toLocaleDateString()}
                      </time>
                    </div>
                    <RatingStars value={review.rating} />
                    <span className="review-verified">Verified delivery</span>
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
                ))}
                {data.meta.last_page > 1 && (
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
                )}
              </section>
            </div>
          </>
        )
      )}
    </section>
  );
}
