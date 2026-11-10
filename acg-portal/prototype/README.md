# Interactive portal prototype

Open `index.html` in a browser. The font, logo, UI and sample PDF are embedded in the file. Use synthetic information for the demo. Refreshing clears all changes.

Choose **Investor** to see the sample note, distribution ledger, Documents and Profile. Choose **Investor Relations** to open the Team Console. The sidebar footer lets you switch roles during a walkthrough.

- **Payments.** Open **Investors → Margaret Vance → Distribution payments**. Select a distribution, enter a payment date and reference, and record it. Switch to that demo investor to see the updated total and ledger. The final distribution includes principal. Note edits preserve each recorded installment’s position, due date and amount. The walkthrough uses June 30, 2026 as its demo date.
- **Documents.** In the same investor detail panel, choose a document type and **Attach sample PDF**. That investor can download the included synthetic PDF from Documents. The prototype simulates private storage in memory.
- **Email.** Create an investor with **Email an invitation** checked, use **Email password link** on an existing investor, or use **Forgot password?** at sign-in. Open the **Demo inbox** to follow the one-use link. Recording a distribution adds a simulated notice when the investor’s preference is on. **Run demo maturity check** simulates the scheduled reminder for eligible notes. Email stays in the walkthrough.
- **Authenticator.** Open **Security** as either role. Use the prefilled demo password and the fixed sample code `123456` to enable the second step. Save the displayed demo recovery codes. Each recovery code works once at sign-in. Security settings also let you replace the codes or disable the authenticator.

The [application runbook](../DEPLOY.md) covers the deployed portal.
