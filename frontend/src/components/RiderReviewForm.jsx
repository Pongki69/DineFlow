import { useState } from "react";
import { Star } from "lucide-react";
import { api } from "../api";
import { Button, Feedback } from "./ui";
import "./riderReviews.css";

export const reviewCategories = {
  delivery_time: "On-time delivery",
  communication: "Good communication",
  handling: "Careful handling",
  professionalism: "Friendly service",
};
export function maskedReviewerName(name = "") {
  const letters = Array.from(name.trim().split(/\s+/)[0] || "");
  if (!letters.length) return "Customer";
  return letters.length <= 3
    ? `${letters[0]}*****`
    : `${letters.slice(0, 2).join("")}*****${letters.at(-1)}`;
}
export function RatingStars({ value, size = 18 }) {
  return (
    <span
      className="review-stars"
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          size={size}
          key={star}
          fill={star <= Number(value) ? "currentColor" : "none"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export function RiderReviewForm({ deliveryId, review, rating, user, onSaved }) {
  const [editing, setEditing] = useState(!rating);
  const [draft, setDraft] = useState({
    rating: 0,
    comment: "",
    categories: [],
    show_name: false,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const hasReview = Boolean(rating || review);
  function edit() {
    setDraft({
      rating: Number(review?.rating || rating || 0),
      comment: review?.comment || "",
      categories: review?.categories || [],
      show_name: review?.show_name || false,
    });
    setEditing(true);
    setError("");
  }
  async function save(event) {
    event.preventDefault();
    if (!draft.rating) return;
    setBusy(true);
    setError("");
    try {
      await api(`/my/deliveries/${deliveryId}/rating`, {
        method: hasReview ? "PATCH" : "POST",
        body: JSON.stringify(draft),
      });
      setEditing(false);
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="rider-review-form"
      aria-labelledby="review-form-heading"
    >
      <div className="review-section-heading">
        <h2 id="review-form-heading">
          {hasReview ? "Your review" : "Rate your rider"}
        </h2>
        {!editing && (
          <Button variant="secondary" onClick={edit}>
            Edit review
          </Button>
        )}
      </div>
      {error && <Feedback>{error}</Feedback>}
      {!editing ? (
        <>
          <RatingStars value={review?.rating || rating} />
          <div className="review-tags">
            {review?.categories?.map((key) => (
              <span key={key}>{reviewCategories[key]}</span>
            ))}
          </div>
          {review?.comment && (
            <p className="review-comment">{review.comment}</p>
          )}
          <small>
            {review?.show_name ? "Your name is visible" : "Your name is masked"}
          </small>
        </>
      ) : (
        <form onSubmit={save} aria-busy={busy}>
          <fieldset className="review-score-input">
            <legend>Overall rating</legend>
            <div>
              {[1, 2, 3, 4, 5].map((value) => (
                <label
                  key={value}
                  className={draft.rating >= value ? "selected" : ""}
                >
                  <input
                    type="radio"
                    required
                    name={`rating-${deliveryId}`}
                    value={value}
                    checked={draft.rating === value}
                    onChange={() => setDraft({ ...draft, rating: value })}
                  />
                  <Star
                    size={30}
                    fill={draft.rating >= value ? "currentColor" : "none"}
                    aria-hidden="true"
                  />
                  <span className="sr-only">
                    {value} {value === 1 ? "star" : "stars"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="review-category-input">
            <legend>
              What stood out? <span>Optional</span>
            </legend>
            <div>
              {Object.entries(reviewCategories).map(([key, label]) => (
                <label
                  className={draft.categories.includes(key) ? "selected" : ""}
                  key={key}
                >
                  <input
                    type="checkbox"
                    checked={draft.categories.includes(key)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        categories: e.target.checked
                          ? [...draft.categories, key]
                          : draft.categories.filter((item) => item !== key),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="review-comment-input">
            Comment <span>Optional · visible on the rider’s profile</span>
            <textarea
              maxLength={1000}
              rows={3}
              value={draft.comment}
              onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
              placeholder="How was your delivery?"
            />
          </label>
          <label className="review-identity-input">
            <input
              type="checkbox"
              checked={draft.show_name}
              onChange={(e) =>
                setDraft({ ...draft, show_name: e.target.checked })
              }
            />
            <span>
              Show my name
              <small>
                {draft.show_name ? user?.name : maskedReviewerName(user?.name)}
              </small>
            </span>
          </label>
          <div className="review-form-actions">
            {hasReview && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" busy={busy} disabled={!draft.rating}>
              {hasReview ? "Save review" : "Submit review"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
