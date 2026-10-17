import { Fragment, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPackage, FiChevronDown, FiChevronUp, FiRefreshCw, FiShoppingBag, FiNavigation, FiStar, FiCheckCircle, FiX } from 'react-icons/fi';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { getUserStorageKey } from '../utils/userStorage';
import { formatPrice, getOrderBillBreakdown } from '../utils/format';
import Loading from '../components/Loading';
import './Orders.css';

const Orders = () => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { user, isAuthenticated, isLoaded, getToken } = useAuth();
  const [expandedId, setExpandedId] = useState(null);
  const [reordered, setReordered] = useState(null);
  const [dbOrders, setDbOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reviewedKeys, setReviewedKeys] = useState(new Set());
  const [reviewModal, setReviewModal] = useState(null); // { productId, orderItemId, productName }
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', comment: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [returnModal, setReturnModal] = useState(null); // order object
  const [returnReason, setReturnReason] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [returnedIds, setReturnedIds] = useState(new Set());

  // Real products are reviewed once per product (covers every order); combo/
  // festive-offer items have no shared product identity, so they're keyed by
  // the specific purchased line item instead.
  const reviewKey = (item) => `oi:${item.id || item.orderItemId}`;

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let active = true;
    fetch('/api/admin/auth?action=reviews')
      .then(r => (r.ok ? r.json() : []))
      .then(allReviews => {
        if (!active) return;
        const mine = allReviews
          .filter(r => r.userId === user.id)
          .filter(r => r.orderItemId)
          .map(r => `oi:${r.orderItemId}`);
        setReviewedKeys(new Set(mine));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [isAuthenticated, user?.id]);

  const openReviewModal = (item) => {
    setReviewForm({ rating: 5, title: '', comment: '' });
    setReviewError('');
    setReviewModal({ productId: item.productId || null, orderItemId: item.id, productName: item.name });
  };

  const submitReview = async () => {
    if (!reviewModal || typeof getToken !== 'function') return;
    setReviewSubmitting(true);
    setReviewError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/auth?action=reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          productId: reviewModal.productId,
          orderItemId: reviewModal.orderItemId,
          rating: reviewForm.rating,
          title: reviewForm.title,
          comment: reviewForm.comment,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReviewError(data.error || 'Failed to submit review.');
        return;
      }
      const key = `oi:${reviewModal.orderItemId}`;
      setReviewedKeys(prev => new Set(prev).add(key));
      setReviewModal(null);
    } catch {
      setReviewError('Network error. Please try again.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const openReturnModal = (order) => {
    setReturnReason('');
    setReturnError('');
    setReturnModal(order);
  };

  const submitReturn = async () => {
    if (!returnModal || typeof getToken !== 'function') return;
    setReturnSubmitting(true);
    setReturnError('');
    try {
      const token = await getToken();
      const res = await fetch(`/api/orders?id=${encodeURIComponent(returnModal.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'return', reason: returnReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReturnError(data.error || 'Failed to request return.');
        return;
      }
      setReturnedIds(prev => new Set(prev).add(returnModal.id));
      setReturnModal(null);
    } catch {
      setReturnError('Network error. Please try again.');
    } finally {
      setReturnSubmitting(false);
    }
  };

  useEffect(() => {
    // Wait for Clerk to finish restoring the session before deciding whether
    // to fetch — on a fresh page load isAuthenticated reads false for a
    // moment even for an already-signed-in user, which used to render the
    // (often stale/smaller) localStorage order list first and then swap to
    // the real DB list a moment later — the "5 orders, then 2" flicker.
    if (!isLoaded) return;

    let active = true;
    const fetchDbOrders = async () => {
      if (isAuthenticated && getToken) {
        setLoading(true);
        try {
          const token = await getToken();
          const res = await fetch('/api/orders', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (active) {
              setDbOrders(data);
              setLoadFailed(false);
            }
          } else {
            if (active) {
              setDbOrders([]);
              setLoadFailed(true);
            }
          }
        } catch (err) {
          console.error("Error fetching database orders:", err);
          if (active) setLoadFailed(true);
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      } else {
        // Confirmed guest — nothing to fetch.
        if (active) setLoading(false);
      }
    };
    fetchDbOrders();
    return () => {
      active = false;
    };
    // getToken is called fresh above, not read reactively — depending on its
    // identity (which some Clerk versions don't keep stable across renders)
    // re-ran this fetch on unrelated re-renders and could show a stale,
    // still-loading dbOrders/localOrders count for a moment before the next
    // fetch resolved, i.e. the order count flickering between two values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isAuthenticated]);

  const localOrders = useMemo(() => {
    if (!isAuthenticated) return [];
    try {
      const saved = localStorage.getItem(getUserStorageKey(user, 'orders'));
      const parsed = saved ? JSON.parse(saved) : [];
      return parsed.filter(order => order?.address || order?.payment);
    } catch {
      return [];
    }
  }, [isAuthenticated, user]);

  const orders = dbOrders.length > 0 ? dbOrders.map(order => {
    const rawId = order.id;
    const itemsSummary = (order.items || []).map(item => item.name).join(', ');
    return {
      id: rawId,
      displayId: `Order #${rawId}`,
      itemsSummary: itemsSummary ? ` - ${itemsSummary}` : '',
      date: order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently',
      status: order.status?.toLowerCase() || 'pending',
      deliveryTime: 'Same day',
      payment: order.paymentMethod || 'COD',
      address: { address: order.deliveryAddress },
      items: order.items || [],
      total: order.total,
      returnStatus: order.returnStatus || 'None'
    };
  }) : localOrders.map(order => {
    let rawId = order.id;
    if (typeof rawId === 'string' && rawId.startsWith('ORD-')) {
      rawId = rawId.slice(4);
    }
    const itemsSummary = (order.items || []).map(item => item.name).join(', ');
    return {
      ...order,
      id: rawId,
      displayId: `Order #${rawId}`,
      itemsSummary: itemsSummary ? ` - ${itemsSummary}` : '',
      items: order.items || []
    };
  });

  const getStatusStyle = (status) => {
    switch (status?.toLowerCase()) {
      case 'delivered': return { bg: '#D8F3DC', color: '#1B4332', label: 'Order Delivered' };
      case 'preparing':
      case 'confirmed': return { bg: '#D1ECF1', color: '#0C5460', label: 'Order Confirmed' };
      case 'pending':
      case 'placed': return { bg: '#FEF3C7', color: '#92400E', label: 'Order Placed' };
      case 'paid': return { bg: '#D8F3DC', color: '#1B4332', label: 'Paid' };
      case 'cancelled': return { bg: '#FEE2E2', color: '#991B1B', label: 'Cancelled' };
      default: return { bg: '#E5E7EB', color: '#6B7280', label: status || 'Order Placed' };
    }
  };

  const handleReorder = (order) => {
    order.items.forEach(item => {
      addToCart({
        ...item,
        id: item.id || `${item.name}-${Date.now()}`,
        quantity: 1,
        weight: item.weight || '1',
        unit: item.unit || 'pc',
        image: item.image || '',
        discount: item.discount || 0,
        deliveryTime: item.deliveryTime || '10 mins'
      });
    });
    setReordered(order.id);
    setTimeout(() => setReordered(null), 2000);
  };

  // Show a loading skeleton instead of rendering the localStorage fallback
  // list first — orders otherwise flashed a stale/smaller cached count for
  // a moment before the real database list replaced it.
  if (!isLoaded || loading) {
    return <Loading />;
  }

  return (
    <div className="page-wrapper">
      <div className="orders">
        <div className="container">
          <h1 className="orders__title">
            <FiPackage /> My Orders
            <span className="orders__count">{orders.length} orders</span>
          </h1>

          {orders.length === 0 && loadFailed ? (
            <div className="orders__empty">
              <span className="orders__empty-icon">⚠️</span>
              <h2>Couldn't load your orders</h2>
              <p>We're having trouble reaching the server right now. Please try again shortly.</p>
              <button className="orders__empty-btn" onClick={() => window.location.reload()}>
                <FiRefreshCw /> Retry
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="orders__empty">
              <span className="orders__empty-icon">📋</span>
              <h2>No orders yet</h2>
              <p>Start shopping to see your orders here</p>
              <button className="orders__empty-btn" onClick={() => navigate('/home')}>
                <FiShoppingBag /> Start Shopping
              </button>
            </div>
          ) : (
            <div className="orders__list">
              {orders.map(order => {
                const status = getStatusStyle(order.status);
                const isExpanded = expandedId === order.id;
                const reviewableItems = order.items.filter(item => item.productId || item.id);
                const unreviewedItems = reviewableItems.filter(item => !reviewedKeys.has(reviewKey(item)));
                return (
                  <Fragment key={order.id}>
                  <div className="orders__card">
                    <div className="orders__card-header" onClick={() => setExpandedId(isExpanded ? null : order.id)}>
                      <div className="orders__card-top">
                        <div>
                           <span className="orders__card-id">
                            {order.displayId}
                            {order.itemsSummary && (
                              <span className="orders__card-items-summary" style={{ fontWeight: 'normal', opacity: 0.75, fontSize: '13px', marginLeft: '6px', color: '#6b7280' }}>
                                {order.itemsSummary}
                              </span>
                            )}
                          </span>
                          <span className="orders__card-date">{order.date}</span>
                        </div>
                        <span className="orders__status" style={{ background: status.bg, color: status.color }}>
                          {status.label}
                        </span>
                      </div>
                      <div className="orders__card-bottom">
                        <span className="orders__card-summary">
                          {order.items.length} items · {formatPrice(order.total)}
                        </span>
                        {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="orders__card-details">
                        {order.items.map((item, i) => (
                          <div key={i} className="orders__detail-item">
                            <span>{item.name} x {item.qty || item.quantity}</span>
                            <span>{formatPrice(item.price * (item.qty || item.quantity || 1))}</span>
                          </div>
                        ))}
                        {(() => {
                          const breakdown = getOrderBillBreakdown(order);
                          return (
                            <>
                              <div className="orders__detail-item" style={{ color: '#4b5563' }}>
                                <span>Delivery Fee</span>
                                <span>{breakdown.deliveryFee > 0 ? formatPrice(breakdown.deliveryFee) : <strong style={{ color: '#166534' }}>FREE</strong>}</span>
                              </div>
                              {(breakdown.discount > 0 || breakdown.couponCode) && (
                                <div className="orders__detail-item" style={{ color: '#166534', fontWeight: 600 }}>
                                  <span>Coupon ({breakdown.couponCode || 'Applied'})</span>
                                  <span>-{formatPrice(breakdown.discount)}</span>
                                </div>
                              )}
                            </>
                          );
                        })()}
                        <div className="orders__detail-total">
                          <span>Total</span><span>{formatPrice(order.total)}</span>
                        </div>
                        <div className="orders__detail-actions">
                          <button
                            className="orders__track-btn"
                            onClick={() => navigate(`/track/${order.id}`)}
                          >
                            <FiNavigation /> Track Order
                          </button>
                          <button
                            className={`orders__reorder-btn ${reordered === order.id ? 'orders__reorder-btn--done' : ''}`}
                            onClick={() => handleReorder(order)}
                          >
                            <FiRefreshCw /> {reordered === order.id ? 'Added to Cart!' : 'Reorder'}
                          </button>
                        </div>
                        {order.status === 'delivered' && (order.returnStatus === 'None') && !returnedIds.has(order.id) && (
                          <div className="orders__detail-actions">
                            <button
                              className="orders__track-btn"
                              style={{ color: '#DC2626', borderColor: 'rgba(220,38,38,0.35)' }}
                              onClick={() => openReturnModal(order)}
                            >
                              Return Order
                            </button>
                          </div>
                        )}
                        {(order.returnStatus && order.returnStatus !== 'None') || returnedIds.has(order.id) ? (
                          <div className="orders__reviewed-badge" style={{ marginTop: '8px' }}>
                            <FiCheckCircle size={12} /> Return {returnedIds.has(order.id) ? 'requested' : order.returnStatus?.toLowerCase()}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Review prompt — always visible below the order (not hidden
                      behind expand) for any delivered order with reviewable items. */}
                  {order.status === 'delivered' && reviewableItems.length > 0 && (
                    <div className="orders__review-prompt">
                      {unreviewedItems.length > 0 ? (
                        <>
                          <span className="orders__review-prompt-label">Rate your items from this order</span>
                          <div className="orders__review-prompt-list">
                            {unreviewedItems.map((item, i) => (
                              <button
                                key={i}
                                type="button"
                                className="orders__review-btn"
                                onClick={() => openReviewModal(item)}
                              >
                                <FiStar size={12} /> {item.name}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <span className="orders__reviewed-badge"><FiCheckCircle size={12} /> All items from this order reviewed</span>
                      )}
                    </div>
                  )}
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {reviewModal && (
        <div className="orders__review-backdrop" onClick={() => setReviewModal(null)}>
          <div className="orders__review-modal" onClick={e => e.stopPropagation()}>
            <div className="orders__review-modal-header">
              <h3>Rate &amp; Review</h3>
              <button className="orders__review-close" onClick={() => setReviewModal(null)} aria-label="Close">
                <FiX />
              </button>
            </div>
            <p className="orders__review-product">{reviewModal.productName}</p>

            <div className="orders__review-stars">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  className="orders__review-star"
                  onClick={() => setReviewForm(f => ({ ...f, rating: n }))}
                  aria-label={`${n} star`}
                >
                  <FiStar size={26} fill={n <= reviewForm.rating ? '#F5A623' : 'none'} color={n <= reviewForm.rating ? '#F5A623' : '#C4C4C4'} />
                </button>
              ))}
            </div>

            <input
              className="orders__review-input"
              placeholder="Title (optional)"
              value={reviewForm.title}
              onChange={e => setReviewForm(f => ({ ...f, title: e.target.value }))}
              maxLength={80}
            />
            <textarea
              className="orders__review-textarea"
              placeholder="Share your experience with this product (optional)"
              rows={4}
              value={reviewForm.comment}
              onChange={e => setReviewForm(f => ({ ...f, comment: e.target.value }))}
              maxLength={500}
            />

            {reviewError && <p className="orders__review-error">{reviewError}</p>}

            <button
              type="button"
              className="orders__review-submit"
              disabled={reviewSubmitting}
              onClick={submitReview}
            >
              {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </div>
      )}

      {returnModal && (
        <div className="orders__review-backdrop" onClick={() => !returnSubmitting && setReturnModal(null)}>
          <div className="orders__review-modal" onClick={e => e.stopPropagation()}>
            <div className="orders__review-modal-header">
              <h3>Request a Return</h3>
              <button className="orders__review-close" onClick={() => setReturnModal(null)} aria-label="Close">
                <FiX />
              </button>
            </div>
            <p className="orders__review-product">Order #{returnModal.id}</p>

            <textarea
              className="orders__review-textarea"
              placeholder="Tell us why you'd like to return this order (optional)"
              rows={4}
              value={returnReason}
              onChange={e => setReturnReason(e.target.value)}
              maxLength={500}
            />

            {returnError && <p className="orders__review-error">{returnError}</p>}

            <button
              type="button"
              className="orders__review-submit"
              style={{ background: '#DC2626' }}
              disabled={returnSubmitting}
              onClick={submitReturn}
            >
              {returnSubmitting ? 'Submitting...' : 'Submit Return Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
