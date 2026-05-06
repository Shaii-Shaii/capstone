# Donation Logistics Flow System

## Overview

This document describes the complete donation logistics flow implementation for the StrandShare Capstone application. The flow guides donors through a structured process from profile setup through certificate generation.

## Flow Diagram

```
START
├─ Check: Profile Complete?
│  ├─ NO: Show "Complete Profile" → Manage Profile → Return to Donation
│  └─ YES: Continue
│
├─ Check: Hair Eligibility Assessment (within 30 days)?
│  ├─ NO: Show "Hair Eligibility Required" → Hair Assessment Module → Return
│  ├─ YES: Show Result → Ask to Re-assess?
│  │   ├─ YES: Hair Assessment Module → Return
│  │   └─ NO: Continue
│  └─ Continue
│
├─ Step 3: Collect Donation Details
│  ├─ Option A: Use Recent Hair Assessment (auto-fill)
│  │  ├─ Hair Length (from AI detection)
│  │  ├─ Bundle Quantity (manual input)
│  │  └─ Donation Photo (from recent assessment)
│  └─ Option B: Manual Entry
│     ├─ Hair Length (manual input)
│     ├─ Bundle Quantity (manual input)
│     └─ Upload Donation Photo
│
├─ Step 4: Generate QR Code
│  ├─ Create QR Payload with:
│  │  ├─ Submission Code
│  │  ├─ Donor ID
│  │  ├─ Hair Details
│  │  └─ Timestamp
│  └─ Generate QR Image
│
├─ Step 5: Attach QR & Ship
│  ├─ Print/Share QR Code
│  └─ Ship Donation Package
│
├─ Step 6: Staff Receives & Scans QR
│  ├─ Staff scans QR code
│  ├─ Validate QR (check if already used)
│  ├─ Mark as "Received"
│  └─ Notify Donor
│
└─ Step 7: Generate Certificate
   ├─ Create certificate with:
   │  ├─ Donor name
   │  ├─ Donation date
   │  ├─ Hair specifications
   │  └─ Certificate ID
   └─ End
```

## File Structure

### Core Services

**`src/features/donationLogisticsFlow.service.js`**
- Core flow logic and decision points
- Profile completion checking
- Hair eligibility assessment validation
- Donation details validation
- Flow state management
- Main exports:
  - `isProfileComplete(userProfile)`
  - `getRecentHairEligibilityResult(submissions)`
  - `extractHairDetailsFromRecentAssessment(result)`
  - `determineDonationFlowStep(state)`
  - `buildDonationDetailsModel(details)`
  - `validateDonationDetails(details, requirements)`
  - `buildDonationQrPayload(data)`
  - `buildDonationCertificatePayload(data)`

**`src/features/donationLogistics.service.js`**
- Complete donation submission workflow
- QR code generation and management
- PDF generation for QR codes and certificates
- Staff QR scanning and validation
- Notification creation
- Main exports:
  - `submitDonation(userData, donationDetails)`
  - `generateDonationQrPdf(qrData)`
  - `shareDonationQrPdf(pdfUri)`
  - `processDonationQrScan(qrData, staffId)`
  - `generateDonationCertificate(certificateData)`
  - `shareDonationCertificate(pdfUri)`

### State Management

**`src/hooks/useDonationFlow.js`**
- React hook managing the entire flow state
- Handles step progression
- Form state management
- Validation and error handling
- Main features:
  - Current step tracking
  - Profile and hair eligibility status
  - Donation details form state
  - Navigation between steps
  - Pre-fill from recent assessment
  - Error and loading states

### Components

**`src/components/layout/DonationLogisticsFlowScreen.jsx`**
- Main UI component orchestrating the flow
- Divided into 4 steps:
  - Step 1: Profile Completion (with progress indicator)
  - Step 2: Hair Eligibility Check
  - Step 3: Donation Details Collection
  - Step 4: QR Code and Summary
- Handles:
  - Profile management navigation
  - Hair eligibility check triggering
  - Photo selection and upload
  - Form validation
  - Pre-fill functionality

**`app/donor/donations.jsx`**
- Entry point that renders `DonationLogisticsFlowScreen`

## Data Structures

### Hair Submission Model
```javascript
{
  submission_id: string,
  user_id: string,
  donation_drive_id: string,
  organization_id: string,
  submission_code: string,
  donation_source: 'independent_donation' | 'drive_donation' | 'manual_entry',
  bundle_quantity: number,
  status: 'pending_review' | 'received_by_staff' | 'quality_verified',
  created_at: ISO8601,
  ai_screenings: [{
    ai_screening_id: string,
    estimated_length: number,
    detected_color: string,
    detected_density: string,
    decision: 'eligible for hair donation' | 'not eligible',
    confidence_score: number,
    created_at: ISO8601
  }],
  submission_details: [{
    submission_detail_id: string,
    bundle_number: number,
    declared_length: number,
    declared_color: string,
    is_chemically_treated: boolean,
    is_colored: boolean,
    is_bleached: boolean,
    is_rebonded: boolean,
    created_at: ISO8601
  }]
}
```

### Donation Details Model
```javascript
{
  hairLengthValue: number,
  hairLengthUnit: 'in' | 'cm',
  bundleQuantity: number,
  photoPath: string,
  photoFileName: string,
  sourceType: 'independent_donation' | 'drive_donation' | 'manual_entry',
  fromRecentAssessment: boolean,
  recentAssessmentMetadata: object,
  createdAt: ISO8601
}
```

### QR Payload Model
```javascript
{
  submissionCode: string,
  donorId: string,
  donationTimestamp: ISO8601,
  hairLength: number,
  hairLengthUnit: 'in' | 'cm',
  bundleQuantity: number,
  sourceType: string,
  fromRecentAssessment: boolean
}
```

### Flow State Model
```javascript
{
  currentStep: 1 | 2 | 3 | 4,
  flowStepName: string,
  profileComplete: boolean,
  hairEligible: boolean,
  recentHairDetails: object,
  donationDetailsReady: boolean,
  flowStep: {
    step: number,
    name: string,
    title: string,
    description: string,
    action: string
  },
  profileStatus: {
    isComplete: boolean,
    percentage: number,
    completedFields: number,
    totalFields: number,
    missingFieldLabels: string[],
    sections: object[]
  }
}
```

## Integration Points

### Profile Service (`src/features/profile/services/profile.service.js`)
- `buildProfileCompletionMeta()`: Calculates profile completion status
- Used by flow to determine if user can proceed to donation

### Hair Submission API (`src/features/hairSubmission.api.js`)
- `fetchHairSubmissionsByUserId()`: Get user's hair submissions
- `fetchLatestDonationRequirement()`: Get current donation requirements
- `uploadHairSubmissionImage()`: Upload donation photos
- `createHairSubmissionLogistics()`: Create logistics records
- `createHairBundleTrackingEntry()`: Track donation bundles

### Authentication (`src/providers/AuthProvider.js`)
- `user.id`: Donor ID for submission
- `userProfile`: Profile data for validation

### Notifications (`src/features/notification.service.js`)
- `buildDonationNotification()`: Create notification event
- `recordNotifications()`: Log notification to system

## Usage Example

```javascript
import { useDonationFlow } from '../hooks/useDonationFlow';
import { submitDonation } from '../features/donationLogistics.service';

function MyDonationComponent() {
  const { user, userProfile } = useAuth();
  const [hairSubmissions, setHairSubmissions] = useState([]);

  const flow = useDonationFlow({
    userProfile,
    hairSubmissions,
    onFlowComplete: (stage, data) => {
      console.log('Flow completed:', stage, data);
      // Handle completion (show certificate, etc.)
    },
  });

  // Step 1: Check profile
  if (flow.currentStep === 1) {
    return (
      <Button 
        title="Complete Profile" 
        onPress={() => flow.advanceToNextStep()}
      />
    );
  }

  // Step 2: Check hair eligibility
  if (flow.currentStep === 2) {
    return (
      <Button 
        title="Check Hair Eligibility" 
        onPress={() => flow.startHairEligibilityCheck()}
      />
    );
  }

  // Step 3: Enter donation details
  if (flow.currentStep === 3) {
    const handleSubmit = async () => {
      flow.updateDonationDetails({
        hairLength: '14',
        hairLengthUnit: 'in',
        bundleQuantity: '1',
        uploadedPhotoPath: photoPath,
      });

      const result = await submitDonation({
        userId: user.id,
        userProfile,
        donationDetails: flow.donationDetails,
        hairPhotoPath: photoPath,
      });

      console.log('Donation submitted:', result);
    };

    return <Button title="Submit Donation" onPress={handleSubmit} />;
  }
}
```

## Constants and Configuration

### Hair Eligibility Validity
- Default: 30 days
- Can be overridden via `HAIR_ELIGIBILITY_VALIDITY_DAYS` in service

### Minimum Hair Length
- Default: 14 inches (35.56 cm)
- Configured via donation requirements from database

### QR Code Size
- Default: 512px
- Can be customized via `QR_IMAGE_SIZE` constant

## Error Handling

The flow includes comprehensive error handling:

1. **Profile Validation**: Missing required fields shown
2. **Hair Eligibility**: Expired assessments detected
3. **Donation Details**: Validation against requirements
4. **Photo Upload**: Graceful fallback if fails
5. **QR Generation**: Error messages displayed to user

## State Progression Rules

```
Step 1 → Step 2: Requires profileComplete === true
Step 2 → Step 3: Requires hairEligible === true OR user completes assessment
Step 3 → Step 4: Requires donationDetails.photoPath && donationDetails.hairLengthValue
Step 4+: Displays summary and next actions
```

## Mobile UI Considerations

- Responsive card-based layout for each step
- Clear progress indicators
- Touch-friendly buttons and inputs
- Image preview for selected photos
- Auto-fill suggestions when available
- Validation feedback inline with form fields

## Security & Validation

1. **QR Code Validation**: Checks for duplicate/already-used codes
2. **Photo Validation**: Size and format checks before upload
3. **Data Validation**: All inputs validated against requirements
4. **User Authorization**: Only authenticated users can submit donations
5. **Staff Authorization**: Only staff can process QR scans (in future implementation)

## Future Enhancements

1. **Offline Support**: Cache submissions for offline submission
2. **Multi-language**: Localization support
3. **Advanced Analytics**: Track donation flow metrics
4. **AI Recommendations**: Suggest hair types based on user profile
5. **Real-time Tracking**: Live donation package tracking
6. **Integration**: Connect with shipping/logistics partners
7. **Batch Donations**: Support for donors submitting multiple packages

## Testing Checklist

- [ ] Profile completion blocks step progression
- [ ] Hair eligibility older than 30 days triggers reassessment
- [ ] Recent assessment auto-fills form correctly
- [ ] Photo upload works with various image sizes
- [ ] Form validation prevents submission without required fields
- [ ] QR code generates correctly with all metadata
- [ ] Notifications are recorded for staff
- [ ] Certificate generates with correct donor information
- [ ] Flow can be restarted at any step
- [ ] Error states display appropriate messages
