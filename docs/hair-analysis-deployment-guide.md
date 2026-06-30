# Hair Analysis Deployment Guide

## Overview
This guide provides step-by-step instructions for deploying the improved CheckHair AI analysis system.

## Prerequisites
- Supabase CLI installed and configured
- Access to the Supabase project
- OpenAI API key configured in Supabase secrets

## Deployment Steps

### 1. Verify Changes Locally
```bash
# Check for TypeScript errors
npx tsc --noEmit supabase/functions/analyze-hair-submission/index.ts

# Review the changes
git diff supabase/functions/analyze-hair-submission/index.ts
```

### 2. Deploy Edge Function to Supabase
```bash
# Deploy the updated edge function
supabase functions deploy analyze-hair-submission

# Verify deployment
supabase functions list
```

### 3. Test the Deployed Function

#### Test 1: Dry Hair Scenario
```bash
# Use the Donivra mobile app to:
# 1. Navigate to CheckHair
# 2. Upload photos of visibly dry, dull hair
# 3. Complete questionnaire indicating dry hair
# 4. Run analysis
# 5. Verify recommendations mention "dull appearance" or "lack of shine"
```

#### Test 2: Oily Scalp Scenario
```bash
# Use the Donivra mobile app to:
# 1. Navigate to CheckHair
# 2. Upload photos with visible scalp oiliness
# 3. Complete questionnaire indicating oily scalp
# 4. Run analysis
# 5. Verify recommendations mention "visible oiliness" or "oily roots"
```

#### Test 3: Healthy Hair Scenario
```bash
# Use the Donivra mobile app to:
# 1. Navigate to CheckHair
# 2. Upload photos of shiny, healthy hair
# 3. Complete questionnaire indicating healthy hair
# 4. Run analysis
# 5. Verify recommendations focus on maintenance, not problems
```

### 4. Monitor Function Logs
```bash
# Watch function logs in real-time
supabase functions logs analyze-hair-submission --follow

# Look for:
# - Successful invocations
# - Recommendation counts (should be 3)
# - Confidence scores (should be 0.6-1.0)
# - No error patterns
```

### 5. Verify Database Records
```sql
-- Check recent AI screenings
SELECT 
  ai_screening_id,
  detected_condition,
  summary,
  (SELECT COUNT(*) FROM jsonb_array_elements(recommendations)) as recommendation_count,
  confidence_score,
  created_at
FROM ai_screenings
ORDER BY created_at DESC
LIMIT 10;

-- Verify recommendations are diverse
SELECT 
  detected_condition,
  jsonb_array_elements(recommendations)->>'title' as recommendation_title,
  COUNT(*) as usage_count
FROM ai_screenings
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY detected_condition, recommendation_title
ORDER BY detected_condition, usage_count DESC;
```

## Rollback Plan

If issues are detected:

### Option 1: Quick Rollback via Git
```bash
# Revert the changes
git revert HEAD

# Redeploy the previous version
supabase functions deploy analyze-hair-submission
```

### Option 2: Manual Rollback
```bash
# Checkout previous version
git checkout HEAD~1 -- supabase/functions/analyze-hair-submission/index.ts

# Redeploy
supabase functions deploy analyze-hair-submission

# Restore current version
git checkout HEAD -- supabase/functions/analyze-hair-submission/index.ts
```

## Post-Deployment Monitoring

### Week 1: Intensive Monitoring
- Check function logs daily
- Review 10-20 new AI screening results
- Collect user feedback on recommendation quality
- Monitor error rates and confidence scores

### Week 2-4: Regular Monitoring
- Check function logs 2-3 times per week
- Review recommendation diversity metrics
- Track user satisfaction trends
- Monitor for any repetitive patterns

### Metrics to Track

1. **Recommendation Diversity**
   - Unique recommendation titles per condition
   - Should see 5-10 different titles per condition type

2. **Confidence Scores**
   - Average should be 0.7-0.9
   - Low scores (<0.5) indicate image quality issues

3. **Decision Distribution**
   - Eligible: 40-60%
   - Needs Review: 20-30%
   - Not Yet Eligible: 10-20%
   - Retake Photos: <10%

4. **User Feedback**
   - Recommendation relevance ratings
   - User comments on result quality
   - Repeat usage patterns

## Troubleshooting

### Issue: AI Returns Empty Recommendations
**Symptom**: `recommendations` array is empty or has generic fallbacks

**Solution**:
1. Check OpenAI API key is valid
2. Verify function has sufficient timeout (should be 60s+)
3. Check image sizes aren't too large (should be <1.5MB each)
4. Review function logs for OpenAI errors

### Issue: Recommendations Still Generic
**Symptom**: Same recommendations for different conditions

**Possible Causes**:
1. AI not following new instructions (rare)
2. Fallback logic triggering too often
3. Images not clear enough for observation

**Solution**:
1. Check `visible_damage_notes` field - should have specific observations
2. Review confidence scores - should be >0.6
3. Test with higher quality images
4. Check if AI is returning recommendations (vs. fallbacks)

### Issue: "Retake Photos" Too Frequent
**Symptom**: >20% of results have "Retake Photos" decision

**Solution**:
1. Review image quality guidelines in app
2. Check if users are uploading correct views
3. Verify lighting instructions are clear
4. Consider adjusting confidence threshold

### Issue: Function Timeout
**Symptom**: 504 errors or timeout messages

**Solution**:
1. Check image sizes - optimize if >1MB
2. Verify OpenAI API is responding quickly
3. Consider increasing function timeout
4. Review image optimization logic in client

## Success Criteria

Deployment is successful when:
- ✅ Function deploys without errors
- ✅ All test scenarios pass
- ✅ Recommendations are diverse and specific
- ✅ Confidence scores average >0.7
- ✅ "Retake Photos" rate <10%
- ✅ No increase in error rates
- ✅ User feedback is positive

## Support Contacts

- **Technical Issues**: [Your team's contact]
- **Supabase Support**: support@supabase.com
- **OpenAI API Issues**: support@openai.com

## Additional Resources

- [Supabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)
- [OpenAI Structured Outputs Guide](https://platform.openai.com/docs/guides/structured-outputs)
- [Hair Analysis Improvements Documentation](./hair-analysis-improvements.md)
- [Implementation Summary](./hair-analysis-implementation-summary.md)

## Changelog

### Version 2.0 (Current)
- Enhanced AI prompt with observation checklist
- Improved fallback recommendation logic
- Added observation-based summary generation
- Strengthened image-first analysis mandate
- Enhanced history assessment instructions

### Version 1.0 (Previous)
- Basic AI analysis with generic fallbacks
- Condition-keyword-based recommendations
- Limited image analysis emphasis
