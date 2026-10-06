@OmniQA
Feature: Enterprise QA Intelligence and Automated Test Workflows
  As a QA Engineer
  I want to automate UI, API, and collaboration scenarios in OmniQA Studio
  So that our software quality stays continuous, robust, and verified

  @UI @Smoke
  Scenario: QA Engineer registers account and accesses the dashboard
    Given the OmniQA Studio application login page is accessible
    When the QA engineer enters credentials with username "lead_qa_tester" and password "Password@123"
    And clicks on the "Sign In" button
    Then the user should see the automation dashboard with title "OmniQA Studio"

  @API @Hybrid
  Scenario: Fast API data seeding and validation
    Given an authenticated QA user session is generated via API
    When a new automated test run with name "Payment Gateway Regression" and status "PASSED" is submitted
    Then the test run should be successfully recorded in the OmniQA Studio database

  @AI @CodeAnalysis
  Scenario: AI Root Cause Analysis and Code Refactoring
    Given a buggy code snippet containing an off-by-one array boundary error
    When the QA engineer submits the snippet to the AI Code Analyzer API
    Then the response should contain the refactored code and a beginner-friendly explanation
