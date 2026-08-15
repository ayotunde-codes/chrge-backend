# CNG Financing Application API

All endpoints use the global `/api/v1` prefix.

## Access model

`POST /cng/applications` creates a draft and returns an `accessToken` once. An anonymous client must retain that token and send it as `X-Application-Token` on subsequent requests for the same application.

Signed-in applicants can use their bearer token instead. An anonymous application can be attached to a signed-in account with `POST /cng/applications/:id/claim`, using both the bearer token and the application token.

Application documents are private. They are not served from the public `/uploads` path and can only be downloaded through the authorized download endpoint.

The configured storage directory must be backed by a persistent volume in deployed environments. Docker Compose mounts the included `chrge_private_uploads` volume automatically.

## Recommended integration sequence

1. Read available packages, plans, and document rules with `GET /cng/applications/configuration`.
2. Create a draft with `POST /cng/applications` and retain `id` plus `accessToken`.
3. Request and verify the applicant phone number.
4. Save Personal Details with `PATCH /cng/applications/:id/personal`.
5. Save Vehicle Details with `PATCH /cng/applications/:id/vehicle`.
6. Upload each document independently.
7. Save package, financing, loan tenor, and consent.
8. Read the application to confirm `progress` has no missing requirements.
9. Submit with `POST /cng/applications/:id/submit`.

Every step save returns the current application and progress state, so the client can resume a draft safely.

## Applicant endpoints

| Method | Endpoint                                           | Purpose                                                     |
| ------ | -------------------------------------------------- | ----------------------------------------------------------- |
| GET    | `/cng/applications/configuration`                  | Packages, plans, document rules, and policy version         |
| POST   | `/cng/applications`                                | Create a draft and one-time application token               |
| GET    | `/cng/applications/me`                             | List applications owned by the signed-in user               |
| GET    | `/cng/applications/:id`                            | Retrieve a draft or submitted application                   |
| POST   | `/cng/applications/:id/claim`                      | Attach an anonymous draft to a user account                 |
| PATCH  | `/cng/applications/:id/personal`                   | Save personal, employment, address, and next-of-kin fields  |
| POST   | `/cng/applications/:id/phone-verification/request` | Send a six-digit verification code                          |
| POST   | `/cng/applications/:id/phone-verification/verify`  | Verify the phone number                                     |
| PATCH  | `/cng/applications/:id/vehicle`                    | Save vehicle and conversion compatibility fields            |
| PATCH  | `/cng/applications/:id/financing`                  | Save package, plan, tenor, and privacy consent              |
| POST   | `/cng/applications/:id/documents/:type`            | Upload or replace one document using multipart field `file` |
| DELETE | `/cng/applications/:id/documents/:type`            | Remove one document from a draft                            |
| GET    | `/cng/applications/:id/documents/:type/download`   | Download one private document                               |
| POST   | `/cng/applications/:id/submit`                     | Validate and submit the completed application               |
| POST   | `/cng/applications/:id/cancel`                     | Cancel a draft or submitted application                     |

## Administrative endpoints

These routes require an `ADMIN` or `OPERATOR` bearer token.

| Method | Endpoint                             | Purpose                               |
| ------ | ------------------------------------ | ------------------------------------- |
| GET    | `/admin/cng-applications`            | List, search, and filter applications |
| GET    | `/admin/cng-applications/:id`        | Retrieve one application for review   |
| PATCH  | `/admin/cng-applications/:id/status` | Mark under review, approve, or reject |

The status endpoint accepts `UNDER_REVIEW`, `APPROVED`, or `REJECTED`. Rejection requires `rejectionReason`.

## Phone verification delivery

Set `CNG_OTP_WEBHOOK_URL` to an SMS provider adapter that accepts:

```json
{
  "phone": "+2348012345678",
  "code": "123456",
  "purpose": "cng_application_phone_verification"
}
```

When `CNG_OTP_WEBHOOK_TOKEN` is set, it is sent as a bearer token. In non-production environments without a webhook, the request response contains `developmentCode`. Production refuses to issue a challenge until delivery is configured.

## Personal details example

```json
{
  "firstName": "Emeka",
  "middleName": "Chukwuemeka",
  "lastName": "Okafor",
  "gender": "male",
  "dateOfBirth": "1990-01-15",
  "maritalStatus": "married",
  "email": "emeka@example.com",
  "phone": "08012345678",
  "bvn": "12345678901",
  "nin": "12345678901",
  "currentlyEmployed": true,
  "employmentStatus": "employed",
  "employmentSector": "private",
  "employerName": "Example Logistics Limited",
  "occupationJobTitle": "Operations Manager",
  "monthlyIncome": "₦200,000 – ₦400,000",
  "employmentStartDate": "2020-01-01",
  "employmentConfirmationDate": "2020-07-01",
  "address": "14 Herbert Macaulay Way, Yaba",
  "state": "Lagos",
  "lga": "Yaba",
  "nextOfKinName": "Chidi Okafor",
  "nextOfKinPhone": "08023456789",
  "nextOfKinRelationship": "Sibling"
}
```

BVN and NIN are encrypted before persistence. Read responses expose only masked suffixes.

## Vehicle details example

```json
{
  "vehicleBrand": "Toyota",
  "vehicleModel": "Camry",
  "vehicleYear": 2018,
  "manufacturingDate": "2018-06",
  "vehicleColor": "Silver",
  "mileage": "85000",
  "fuelSystem": "injector",
  "engineType": "4_cylinder",
  "licensePlate": "ABC123XY",
  "chassisNumber": "1HGBH41JXMN109186",
  "engineNumber": "2AZFE1234567"
}
```

## Financing example

```json
{
  "packageId": "B",
  "financingPlanId": "gold",
  "preferredLoanTenor": 6,
  "privacyConsent": true,
  "privacyPolicyVersion": "1.0"
}
```

The server calculates and stores the price, deposit, financed amount, interest, monthly payment, and total-cost snapshot.

## Required document types

- `govt_id`
- `proof_address`
- `drivers_license`
- `passport_photo`
- `proof_income`
- `bank_statement`
- `vehicle_reg`
- `insurance`
- `vehicle_front`
- `vehicle_back`
- `vehicle_side`

Optional employment documents are `company_id`, `employment_letter`, and `confirmation_letter`.
