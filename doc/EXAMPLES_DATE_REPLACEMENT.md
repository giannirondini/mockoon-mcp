# Date Replacement Examples

This document provides comprehensive examples for using the `replace_dates_with_templates` tool in various real-world scenarios. Each example includes the complete tool sequence and expected outcomes.

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Booking System](#scenario-1-booking-system)
3. [Order Fulfillment](#scenario-2-order-fulfillment)
4. [Event Management](#scenario-3-event-management)
5. [Financial Transactions](#scenario-4-financial-transactions)
6. [Multi-Leg Journey](#scenario-5-multi-leg-journey)
7. [E-Commerce with Multiple Response Types](#scenario-6-e-commerce-with-multiple-response-types)
8. [What NOT to Do](#what-not-to-do)

---

## Basic Usage

### Strategies Overview

| Strategy | Use Case | Template Generated |
|----------|----------|-------------------|
| `offset` | Dates relative to current time | `{{dateTimeShift days=N format='yyyy-MM-dd'}}` |
| `relative` | Dates relative to request parameters | `{{dateTimeShift date=(bodyRaw 'variableName') days=N}}` |
| `manual` | Custom template variable | `{{variableName}}` |

### Using responseIndex vs responseId

```javascript
// Option A: Use responseIndex (0-based position) - RECOMMENDED
replace_dates_with_templates({
  filePath: "config.json",
  routeId: "abc-123",
  responseIndex: 0,  // First response
  strategy: "offset"
})

// Option B: Use responseId (UUID)
replace_dates_with_templates({
  filePath: "config.json",
  routeId: "abc-123",
  responseId: "resp-uuid-456",  // Specific UUID
  strategy: "offset"
})
```

### Field Targeting

```javascript
// Target specific fields with regex pattern
replace_dates_with_templates({
  filePath: "config.json",
  routeId: "abc-123",
  responseIndex: 0,
  strategy: "offset",
  fieldPattern: "created_.*"  // Matches created_at, created_date, etc.
})

// Target exact field names
replace_dates_with_templates({
  filePath: "config.json",
  routeId: "abc-123",
  responseIndex: 0,
  strategy: "offset",
  fieldNames: ["order_date", "ship_date", "delivery_date"]
})
```

---

## Scenario 1: Booking System

### Context
A flight booking API returns booking details with multiple date fields:
- `pnr_creation_date`: When the booking was created (should be offset from today)
- `departure_timestamp_outbound`: Flight departure (should be relative to search date)
- `departure_timestamp_inbound`: Return flight (should be relative to search date + trip duration)

### Sample Response Body
```json
{
  "booking": {
    "pnr": "ABC123",
    "pnr_creation_date": "2024-01-15",
    "passenger": {
      "name": "John Doe"
    },
    "flights": [
      {
        "direction": "outbound",
        "departure_timestamp_outbound": "2024-02-20T08:30:00Z",
        "arrival_timestamp": "2024-02-20T12:45:00Z"
      },
      {
        "direction": "inbound",
        "departure_timestamp_inbound": "2024-02-27T14:00:00Z",
        "arrival_timestamp": "2024-02-27T18:15:00Z"
      }
    ]
  }
}
```

### Tool Sequence

```javascript
// Step 1: Find the route
find_route({
  filePath: "/path/to/bookings.json",
  endpoint: "api/bookings",
  method: "POST"
})
// Returns: { routeId: "booking-route-123", responses: [{ index: 0 }] }

// Step 2: Replace pnr_creation_date with offset (-7 days from today)
replace_dates_with_templates({
  filePath: "/path/to/bookings.json",
  routeId: "booking-route-123",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: -7,
  fieldPattern: "pnr_creation_date"
})
// Result: "pnr_creation_date": "{{dateTimeShift days=-7 format='yyyy-MM-dd'}}"

// Step 3: Replace departure_timestamp_outbound with relative strategy
replace_dates_with_templates({
  filePath: "/path/to/bookings.json",
  routeId: "booking-route-123",
  responseIndex: 0,
  strategy: "relative",
  variableName: "params.search_date",
  fieldPattern: "departure_timestamp_outbound"
})
// Result: Uses request body's search_date as reference

// Step 4: Replace departure_timestamp_inbound (7 days after outbound)
replace_dates_with_templates({
  filePath: "/path/to/bookings.json",
  routeId: "booking-route-123",
  responseIndex: 0,
  strategy: "relative",
  variableName: "params.search_date",
  offsetDays: 7,
  fieldPattern: "departure_timestamp_inbound"
})
```

### Expected Outcome
```json
{
  "booking": {
    "pnr": "ABC123",
    "pnr_creation_date": "{{dateTimeShift days=-7 format='yyyy-MM-dd'}}",
    "passenger": {
      "name": "John Doe"
    },
    "flights": [
      {
        "direction": "outbound",
        "departure_timestamp_outbound": "{{dateTimeShift date=(bodyRaw 'params.search_date') days=0}}",
        "arrival_timestamp": "2024-02-20T12:45:00Z"
      },
      {
        "direction": "inbound",
        "departure_timestamp_inbound": "{{dateTimeShift date=(bodyRaw 'params.search_date') days=7}}",
        "arrival_timestamp": "2024-02-27T18:15:00Z"
      }
    ]
  }
}
```

---

## Scenario 2: Order Fulfillment

### Context
An order management system with dates representing the order lifecycle:
- `order_date`: When order was placed (offset from today)
- `shipment_date`: When order ships (offset +2 days)
- `estimated_delivery`: Expected delivery (offset +5 days)
- `actual_delivery`: Actual delivery (offset +4 days)

### Sample Response Body
```json
{
  "order_id": "ORD-12345",
  "order_date": "2024-01-10",
  "status": "delivered",
  "shipping": {
    "shipment_date": "2024-01-12",
    "estimated_delivery": "2024-01-15",
    "actual_delivery": "2024-01-14"
  }
}
```

### Tool Sequence

```javascript
// Step 1: Find the route
find_route({
  filePath: "/path/to/orders.json",
  endpoint: "api/orders/{id}",
  method: "GET"
})

// Step 2: Replace order_date (today - 5 days)
replace_dates_with_templates({
  filePath: "/path/to/orders.json",
  routeId: "order-route-456",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: -5,
  fieldPattern: "order_date"
})

// Step 3: Replace shipment_date (today - 3 days)
replace_dates_with_templates({
  filePath: "/path/to/orders.json",
  routeId: "order-route-456",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: -3,
  fieldPattern: "shipment_date"
})

// Step 4: Replace estimated_delivery (today)
replace_dates_with_templates({
  filePath: "/path/to/orders.json",
  routeId: "order-route-456",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 0,
  fieldPattern: "estimated_delivery"
})

// Step 5: Replace actual_delivery (today - 1 day)
replace_dates_with_templates({
  filePath: "/path/to/orders.json",
  routeId: "order-route-456",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: -1,
  fieldPattern: "actual_delivery"
})
```

---

## Scenario 3: Event Management

### Context
An events API with:
- `registration_open_date`: When registration opens (offset -30 days)
- `registration_close_date`: When registration closes (offset -7 days)
- `event_date`: The event itself (offset +7 days)
- `feedback_deadline`: When feedback is due (offset +14 days)

### Tool Sequence

```javascript
// Step 1: Find the route
find_route({
  filePath: "/path/to/events.json",
  endpoint: "api/events/{eventId}",
  method: "GET"
})

// Step 2: All registration dates with one pattern
replace_dates_with_templates({
  filePath: "/path/to/events.json",
  routeId: "event-route-789",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: -30,
  fieldPattern: "registration_open_date"
})

replace_dates_with_templates({
  filePath: "/path/to/events.json",
  routeId: "event-route-789",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: -7,
  fieldPattern: "registration_close_date"
})

// Step 3: Event date
replace_dates_with_templates({
  filePath: "/path/to/events.json",
  routeId: "event-route-789",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 7,
  fieldPattern: "event_date"
})

// Step 4: Feedback deadline
replace_dates_with_templates({
  filePath: "/path/to/events.json",
  routeId: "event-route-789",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 14,
  fieldPattern: "feedback_deadline"
})
```

---

## Scenario 4: Financial Transactions

### Context
A banking API with transaction dates:
- `transaction_date`: Based on request's query date (relative)
- `settlement_date`: 2 business days after transaction (relative +2)
- `statement_date`: End of current month (offset)

### Sample Response Body
```json
{
  "transactions": [
    {
      "id": "TXN001",
      "transaction_date": "2024-01-15",
      "settlement_date": "2024-01-17",
      "amount": 150.00
    },
    {
      "id": "TXN002",
      "transaction_date": "2024-01-16",
      "settlement_date": "2024-01-18",
      "amount": 275.50
    }
  ],
  "statement_date": "2024-01-31"
}
```

### Tool Sequence

```javascript
// Step 1: Find the route
find_route({
  filePath: "/path/to/banking.json",
  endpoint: "api/accounts/{accountId}/transactions",
  method: "GET"
})

// Step 2: Transaction dates relative to query parameter
replace_dates_with_templates({
  filePath: "/path/to/banking.json",
  routeId: "txn-route-123",
  responseIndex: 0,
  strategy: "relative",
  variableName: "queryStringParameters.from_date",
  fieldPattern: "transaction_date"
})

// Step 3: Settlement dates (transaction + 2 days)
replace_dates_with_templates({
  filePath: "/path/to/banking.json",
  routeId: "txn-route-123",
  responseIndex: 0,
  strategy: "relative",
  variableName: "queryStringParameters.from_date",
  offsetDays: 2,
  fieldPattern: "settlement_date"
})

// Step 4: Statement date (end of month - offset 30 days)
replace_dates_with_templates({
  filePath: "/path/to/banking.json",
  routeId: "txn-route-123",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 30,
  fieldPattern: "statement_date"
})
```

---

## Scenario 5: Multi-Leg Journey

### Context
A travel itinerary with multiple legs, each needing different date offsets:
- Leg 1: Departure today + 14 days
- Leg 2: Departure today + 16 days (layover)
- Leg 3: Departure today + 21 days (return)

### Sample Response Body
```json
{
  "itinerary": {
    "legs": [
      {
        "leg_number": 1,
        "departure_date": "2024-02-01",
        "departure_city": "NYC",
        "arrival_city": "LON"
      },
      {
        "leg_number": 2,
        "departure_date": "2024-02-03",
        "departure_city": "LON",
        "arrival_city": "PAR"
      },
      {
        "leg_number": 3,
        "departure_date": "2024-02-08",
        "departure_city": "PAR",
        "arrival_city": "NYC"
      }
    ]
  }
}
```

### Tool Sequence

For complex nested array structures, use the full path in `fieldPattern`:

```javascript
// Step 1: Find the route
find_route({
  filePath: "/path/to/travel.json",
  endpoint: "api/itinerary",
  method: "POST"
})

// For arrays, you may need to target specific indices or use a general pattern
// Option A: Replace ALL departure_date fields with same offset
replace_dates_with_templates({
  filePath: "/path/to/travel.json",
  routeId: "itinerary-route",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 14,
  fieldPattern: "departure_date"  // Matches all departure_date fields
})

// Option B: For different offsets per leg, use manual templates or multiple responses
// This may require using the `manual` strategy with custom variables
replace_dates_with_templates({
  filePath: "/path/to/travel.json",
  routeId: "itinerary-route",
  responseIndex: 0,
  strategy: "manual",
  variableName: "dateTimeShift days=14 format='yyyy-MM-dd'",
  fieldPattern: "legs.0.departure_date"  // Target first leg specifically
})
```

---

## Scenario 6: E-Commerce with Multiple Response Types

### Context
An API with multiple responses (success, error, partial):
- Response 0 (Success): Full order with all dates
- Response 1 (Partial): Pending order with estimated dates
- Response 2 (Error): No dates to process

### Tool Sequence

```javascript
// Step 1: Find the route
find_route({
  filePath: "/path/to/ecommerce.json",
  endpoint: "api/checkout",
  method: "POST"
})
// Returns: { routeId: "checkout-123", responses: [
//   { index: 0, label: "Success" },
//   { index: 1, label: "Partial" },
//   { index: 2, label: "Error" }
// ]}

// Step 2: Process Success response (index 0)
replace_dates_with_templates({
  filePath: "/path/to/ecommerce.json",
  routeId: "checkout-123",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 0,
  fieldPattern: "order_date"
})

replace_dates_with_templates({
  filePath: "/path/to/ecommerce.json",
  routeId: "checkout-123",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 5,
  fieldPattern: "delivery_date"
})

// Step 3: Process Partial response (index 1)
replace_dates_with_templates({
  filePath: "/path/to/ecommerce.json",
  routeId: "checkout-123",
  responseIndex: 1,
  strategy: "offset",
  offsetDays: 0,
  fieldPattern: "pending_date"
})

replace_dates_with_templates({
  filePath: "/path/to/ecommerce.json",
  routeId: "checkout-123",
  responseIndex: 1,
  strategy: "offset",
  offsetDays: 7,
  fieldPattern: "estimated_.*"  // estimated_shipping, estimated_delivery, etc.
})

// Step 4: Skip Error response (index 2) - no dates to process
```

---

## What NOT to Do

### ❌ Anti-Pattern 1: Using update_response for Date Operations

```javascript
// ❌ WRONG - This can corrupt the file
update_response({
  filePath: "config.json",
  routeId: "abc-123",
  responseIndex: 0,
  body: JSON.stringify({
    "date": "{{now 'yyyy-MM-dd'}}"
  })
})

// ✅ CORRECT - Use the specialized tool
replace_dates_with_templates({
  filePath: "config.json",
  routeId: "abc-123",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 0
})
```

### ❌ Anti-Pattern 2: Manual JSON Editing

```javascript
// ❌ WRONG - Reading, modifying, and writing back manually
const response = await get_response_details({ ... });
const body = JSON.parse(response.body);
body.date = "{{now}}";  // Manual template insertion
await update_response({ body: JSON.stringify(body) });

// ✅ CORRECT - Let the tool handle it
replace_dates_with_templates({
  filePath: "config.json",
  routeId: "abc-123",
  responseIndex: 0,
  strategy: "offset"
})
```

### ❌ Anti-Pattern 3: Single Call for Multiple Strategies

```javascript
// ❌ WRONG - Trying to do everything in one call (not supported)
replace_dates_with_templates({
  filePath: "config.json",
  routeId: "abc-123",
  responseIndex: 0,
  strategy: "offset",  // Can't mix strategies in one call
  // How would you specify different strategies for different fields?
})

// ✅ CORRECT - Multiple calls with field targeting
replace_dates_with_templates({
  filePath: "config.json",
  routeId: "abc-123",
  responseIndex: 0,
  strategy: "offset",
  offsetDays: 7,
  fieldPattern: "created_date"
})

replace_dates_with_templates({
  filePath: "config.json",
  routeId: "abc-123",
  responseIndex: 0,
  strategy: "relative",
  variableName: "params.start_date",
  fieldPattern: "event_date"
})
```

### ❌ Anti-Pattern 4: Guessing UUIDs

```javascript
// ❌ WRONG - Hardcoding or guessing UUIDs
replace_dates_with_templates({
  routeId: "maybe-this-uuid?",
  responseId: "hopefully-correct?"
})

// ✅ CORRECT - Use find_route to get valid identifiers
const route = await find_route({
  filePath: "config.json",
  endpoint: "api/users",
  method: "GET"
});

replace_dates_with_templates({
  routeId: route.routeId,
  responseIndex: 0  // Use index instead of guessing UUID
})
```

---

## Verification Checklist

After performing date replacements, verify:

1. ✅ **File integrity**: Config file is valid JSON
2. ✅ **Template syntax**: Templates use correct Mockoon syntax
3. ✅ **Field accuracy**: Correct fields were replaced
4. ✅ **Strategy applied**: Templates match requested strategy
5. ✅ **Idempotency**: Previously templated dates never match, so nothing is double-templated
6. ✅ **Response statistics**: Check `datesFound` and `datesReplaced`

---

## Related Documentation

- [README.md](../README.md) - Main documentation with tool reference
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture
- [copilot-instructions.md](../.github/copilot-instructions.md) - AI assistant guidelines
