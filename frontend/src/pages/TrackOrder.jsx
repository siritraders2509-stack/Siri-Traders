import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FiArrowLeft, FiCheckCircle, FiClock, FiPackage, FiTruck, FiHome, FiMapPin, FiXCircle } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { getUserStorageKey } from '../utils/userStorage';
import { formatPrice } from '../utils/format';
import './TrackOrder.css';

const STEPS = [
  { id: 'placed',    icon: FiCheckCircle, label: 'Order Placed',    sub: 'We received your order' },
  { id: 'confirmed', icon: FiPackage,     label: 'Order Confirmed', sub: 'Store is preparing your items' },
  { id: 'delivered', icon: FiHome,        label: 'Order Delivered', sub: 'Order delivered successfully!' },
];

const STATUS_TO_STEP = {
  pending:      0,
  placed:       0,
  preparing:    1,
  confirmed:    1,
  packed:       1,
  paid:         1,
  transit:      1,
  'in transit': 1,
  delivered:    2,
  returned:     2,
};

const computeEta = (deliveryTime) => {
  const minsMatch = String(deliveryTime).match(/(\d+)\s*min/i);
  const hoursMatch = String(deliveryTime).match(/(\d+)\s*hour/i);
  let totalMins = 0;
  if (minsMatch) totalMins += parseInt(minsMatch[1]);
  if (hoursMatch) totalMins += parseInt(hoursMatch[1]) * 60;
  if (totalMins === 0) totalMins = 30;

  const arrival = new Date(Date.now() + totalMins * 60 * 1000);
  return {
    time: arrival.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    minutes: totalMins,
  };
};

const TrackOrder = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, isLoaded, getToken } = useAuth();
  const [order, setOrder] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [eta, setEta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const applyOrder = useCallback((found) => {
    setOrder(found);
    setCurrentStep(STATUS_TO_STEP[found.status?.toLowerCase()] ?? 0);
    if (found.deliveryTime && found.status?.toLowerCase() !== 'cancelled') setEta(computeEta(found.deliveryTime));
  }, []);

  const refreshOrder = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setNotFound(false);
    setLoadError(false);

    // The live server record is the source of truth — it's what reflects
    // admin status changes (Preparing/In Transit/Delivered/Paid etc.), so it
    // always wins over anything cached locally. Only fall back to route
    // state / localStorage if we can't reach it.
    if (isAuthenticated && typeof getToken === 'function') {
      try {
        const token = await getToken();
        const res = await fetch(`/api/orders?id=${encodeURIComponent(orderId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          applyOrder({
            id: data.id,
            status: data.status,
            deliveryTime: data.deliverySlot || 'Same day',
            address: { name: data.customerName, address: data.deliveryAddress, phone: data.customerPhone },
            total: data.total,
            items: data.items || [],
            cancellationReason: data.cancellationReason || '',
            cancelledAt: data.cancelledAt || null,
          });
          setLoading(false);
          return;
        }
        // 404/403 mean the order genuinely isn't this user's; anything else
        // (5xx, rate limit, etc.) is a temporary failure — fall through to
        // route state / localStorage rather than giving up immediately.
        if (res.status !== 404 && res.status !== 403) {
          setLoadError(true);
          setLoading(false);
          return;
        }
      } catch {
        // network error — fall through to route state / localStorage below
      }
    }

    // Route state from Checkout (justPlaced=true) — covers the instant right
    // after checkout if the fetch above hasn't resolved yet.
    const state = location.state;
    if (state?.justPlaced) {
      setOrder({
        id: state.orderId,
        status: 'placed',
        deliveryTime: state.deliveryTime,
        address: state.address,
        total: state.total,
        items: state.items,
      });
      setCurrentStep(0);
      if (state.deliveryTime) setEta(computeEta(state.deliveryTime));
      setLoading(false);
      return;
    }

    // Last resort: localStorage (orders placed while offline / on this device)
    try {
      const key = getUserStorageKey(user, 'orders');
      const saved = key ? localStorage.getItem(key) : null;
      const orders = saved ? JSON.parse(saved) : [];
      const found = orders.find(o => String(o.id) === String(orderId));
      if (found) {
        applyOrder(found);
        setLoading(false);
        return;
      }
    } catch { /* ignore */ }

    setNotFound(true);
    setLoading(false);
  }, [orderId, user, location.state, isAuthenticated, getToken, applyOrder]);

  const cancelOrder = async () => {
    if (!order || typeof getToken !== 'function') return;
    setCancelling(true);
    setCancelError('');
    try {
      const token = await getToken();
      const res = await fetch(`/api/orders?id=${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'cancel' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelError(data.error || 'Failed to cancel order.');
        return;
      }
      setShowCancelConfirm(false);
      await refreshOrder(false);
    } catch {
      setCancelError('Network error. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    // Wait for Clerk to finish restoring the session — otherwise a reload
    // runs this while isAuthenticated is still momentarily false, skips the
    // authenticated order lookup, and flashes "order not found" for an
    // order that's actually there.
    if (!isLoaded) return;
    refreshOrder();
  }, [isLoaded, refreshOrder]);

  // Poll for status updates while the order is still moving, so an admin
  // marking it In Transit / Delivered / Paid / Cancelled shows up without a
  // manual reload. Both terminal states (delivered, cancelled) stop polling.
  const isCancelled = order?.status?.toLowerCase() === 'cancelled';
  useEffect(() => {
    if (!order || isCancelled || currentStep >= STEPS.length - 1) return;
    const interval = setInterval(() => refreshOrder(false), 20000);
    return () => clearInterval(interval);
  }, [order, isCancelled, currentStep, refreshOrder]);

  if (loading) {
    return (
      <div className="page-wrapper">
        <div className="track__not-found">
          <FiPackage size={48} />
          <h2>Loading order…</h2>
        </div>
      </div>
    );
  }

  if (loadError && !order) {
    return (
      <div className="page-wrapper">
        <div className="track__not-found">
          <FiPackage size={48} />
          <h2>Couldn't load this order</h2>
          <p>We're having trouble reaching the server right now. Please try again shortly.</p>
          <button onClick={() => refreshOrder()} className="track__back-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!order || notFound) {
    return (
      <div className="page-wrapper">
        <div className="track__not-found">
          <FiPackage size={48} />
          <h2>Order not found</h2>
          <p>We couldn't find order #{orderId}</p>
          <button onClick={() => navigate('/orders')} className="track__back-btn">
            View All Orders
          </button>
        </div>
      </div>
    );
  }

  const isDelivered = currentStep === STEPS.length - 1;

  return (
    <div className="page-wrapper">
      <div className="track">
        <div className="track__shell container">

          {/* Header */}
          <div className="track__header">
            <button className="track__back" onClick={() => navigate('/orders')} aria-label="Back">
              <FiArrowLeft />
            </button>
            <div>
              <h1 className="track__title">Order Tracking</h1>
              <p className="track__order-id">#{order.id || orderId}</p>
            </div>
          </div>

          {/* Success banner for freshly placed orders */}
          {location.state?.justPlaced && (
            <div className="track__success-banner">
              <FiCheckCircle size={22} />
              <div>
                <p className="track__success-title">Order Placed Successfully! 🎉</p>
                <p className="track__success-sub">Thank you for shopping with Siri Traders</p>
              </div>
            </div>
          )}

          {/* ETA banner */}
          {isCancelled && (
            <div className="track__eta-banner track__eta-banner--cancelled">
              <FiXCircle className="track__eta-icon" />
              <div>
                <p className="track__eta-label">Order Cancelled</p>
                <p className="track__eta-time">
                  {order.cancellationReason || 'This order has been cancelled.'}
                  {order.cancelledAt && (
                    <span className="track__eta-mins"> ({new Date(order.cancelledAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})</span>
                  )}
                </p>
              </div>
            </div>
          )}
          {!isCancelled && !isDelivered && eta && (
            <div className="track__eta-banner">
              <FiClock className="track__eta-icon" />
              <div>
                <p className="track__eta-label">Estimated Delivery</p>
                <p className="track__eta-time">
                  You'll get your order by <strong>{eta.time}</strong>
                  <span className="track__eta-mins"> (~{eta.minutes} mins)</span>
                </p>
              </div>
            </div>
          )}
          {!isCancelled && !isDelivered && !eta && order.deliveryTime && (
            <div className="track__eta-banner">
              <FiClock className="track__eta-icon" />
              <div>
                <p className="track__eta-label">Estimated Delivery</p>
                <p className="track__eta-time">{order.deliveryTime}</p>
              </div>
            </div>
          )}
          {!isCancelled && isDelivered && (
            <div className="track__eta-banner track__eta-banner--done">
              <FiCheckCircle className="track__eta-icon" />
              <div>
                <p className="track__eta-label">Delivered!</p>
                <p className="track__eta-time">Your order has arrived ✓</p>
              </div>
            </div>
          )}

          {/* Stepper — replaced by a single cancelled marker when the order
             never reached delivery, since a fulfillment progress bar doesn't
             make sense for an order that was called off. */}
          {isCancelled ? (
            <div className="track__steps track__steps--cancelled">
              <div className="track__step track__step--cancelled">
                <div className="track__step-left">
                  <div className="track__step-circle track__step-circle--cancelled">
                    <FiXCircle size={18} />
                  </div>
                </div>
                <div className="track__step-right">
                  <p className="track__step-label">Order Cancelled</p>
                  <p className="track__step-sub">This order will not be delivered</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="track__steps">
              {STEPS.map((step, i) => {
                const done = i <= currentStep;
                const active = i === currentStep;
                const Icon = step.icon;
                return (
                  <div key={step.id} className={`track__step ${done ? 'track__step--done' : ''} ${active ? 'track__step--active' : ''}`}>
                    <div className="track__step-left">
                      <div className={`track__step-circle ${done ? 'track__step-circle--done' : ''} ${active ? 'track__step-circle--active' : ''}`}>
                        {done && !active ? <FiCheckCircle size={18} /> : <Icon size={18} />}
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={`track__step-line ${i < currentStep ? 'track__step-line--done' : ''}`} />
                      )}
                    </div>
                    <div className="track__step-right">
                      <p className={`track__step-label ${active ? 'track__step-label--active' : ''}`}>{step.label}</p>
                      <p className="track__step-sub">{active ? <span className="track__step-sub--live">● {step.sub}</span> : step.sub}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Delivery address */}
          {order.address && (
            <div className="track__address">
              <FiMapPin className="track__address-icon" />
              <div>
                <p className="track__address-name">{order.address.name}</p>
                <p className="track__address-text">
                  {order.address.flatNo || order.address.address}
                  {order.address.landmark ? `, ${order.address.landmark}` : ''}
                  {order.address.area ? `, ${order.address.area}` : ''}
                  {order.address.pincode ? ` - ${order.address.pincode}` : ''}
                </p>
                {order.address.phone && <p className="track__address-text">{order.address.phone}</p>}
              </div>
            </div>
          )}

          {/* Order items */}
          {order.items?.length > 0 && (
            <div className="track__items">
              <h3 className="track__items-title">Order Items</h3>
              {order.items.map((item, i) => (
                <div key={i} className="track__item">
                  <span className="track__item-name">{item.name}</span>
                  <span className="track__item-qty">x{item.qty || item.quantity || 1}</span>
                  <span className="track__item-price">{formatPrice(item.price * (item.qty || item.quantity || 1))}</span>
                </div>
              ))}
              <div className="track__total">
                <span>Total Paid</span>
                <span>{formatPrice(order.total)}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="track__actions">
            <button className="track__btn track__btn--primary" onClick={() => navigate('/orders')}>
              All Orders
            </button>
            <button className="track__btn track__btn--secondary" onClick={() => navigate('/home')}>
              Continue Shopping
            </button>
          </div>

          {['Preparing', 'Paid'].includes(order.status) && (
            <div className="track__actions">
              <button
                className="track__btn track__btn--danger"
                onClick={() => { setCancelError(''); setShowCancelConfirm(true); }}
              >
                Cancel Order
              </button>
            </div>
          )}

        </div>
      </div>

      {showCancelConfirm && (
        <div className="orders__review-backdrop" onClick={() => !cancelling && setShowCancelConfirm(false)}>
          <div className="orders__review-modal" onClick={e => e.stopPropagation()}>
            <div className="orders__review-modal-header">
              <h3>Cancel this order?</h3>
            </div>
            <p className="orders__review-product">This can't be undone. Order #{order.id} will be cancelled.</p>
            {cancelError && <p className="orders__review-error">{cancelError}</p>}
            <button
              type="button"
              className="orders__review-submit"
              style={{ background: '#DC2626' }}
              disabled={cancelling}
              onClick={cancelOrder}
            >
              {cancelling ? 'Cancelling...' : 'Yes, Cancel Order'}
            </button>
            <button
              type="button"
              className="track__btn track__btn--secondary"
              style={{ width: '100%', marginTop: '8px' }}
              disabled={cancelling}
              onClick={() => setShowCancelConfirm(false)}
            >
              Keep Order
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackOrder;
