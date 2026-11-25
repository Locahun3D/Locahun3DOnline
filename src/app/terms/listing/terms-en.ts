/**
 * Locahun 3D Scan & Listing Terms (v2) - English reference translation of terms-ja.ts.
 *
 * The Japanese text (terms-ja.ts) is authoritative. This file MUST keep exactly the same
 * shape as LISTING_TERMS_JA (same number of articles, same `numbered` flags, same number of
 * paras per article, same string vs {text, items} shape, same number of items), because
 * cross-references such as "Article 18, item 2" depend on array positions.
 */
import type { TermsArticle } from "./terms-types";

export const LISTING_TERMS_EN: readonly TermsArticle[] = [
  {
    "title": "Purpose and Scope",
    "numbered": true,
    "paras": [
      "These terms (\"these Terms\") set forth the conditions under which, in the 3D location-scouting service \"Locahun 3D\" (the \"Service\") operated by Kawaii World Industries Inc. (\"we\", \"us\" or \"our\"), we perform three-dimensional measurement (\"Scanning\" or a \"Scan\") of photo studios, location facilities, event venues and other facilities, list them on the Service, and use the data produced through such Scanning.",
      "These Terms apply to a facility operator who submits to us our prescribed listing application form (the \"Application Form\") and seeks to enter into the Agreement with us (the \"Applicant\"), and to a facility operator who has entered into the Agreement (the \"Facility Operator\"). The Facility Operator uses the Service upon agreeing to these Terms.",
      "These Terms are intended to set forth the rights and obligations between us and the Facility Operator concerning listing on the Service and related matters, and apply to all relationships between us and the Facility Operator relating to the Service.",
      "Notwithstanding the preceding paragraphs, these Terms do not apply to a property listed on the Service using data captured by a third party and submitted to us (a \"Submitted-Scan Property\"); such a property is governed by the submitted-scan terms separately established by us (https://locahun3d.com/terms/submission). No Revenue Share to a Facility Operator under these Terms arises from the sale or other use of 3D Data relating to a Submitted-Scan Property."
    ]
  },
  {
    "title": "Definitions",
    "numbered": false,
    "paras": [
      {
        "text": "The following terms used in these Terms have the meanings set forth in the respective items below.",
        "items": [
          "\"Agreement\" means the agreement concerning the Scanning and listing of the Property, the use of 3D Data and related matters, entered into between us and the Facility Operator, the contents of which consist of the Application Form and these Terms.",
          "\"Service\" means the 3D location-scouting service \"Locahun 3D\" operated by us (including locahun3d.com, viewer.locahun3d.com and any other websites, applications and viewers designated by us).",
          "\"Property\" means the facility and areas stated in the Application Form.",
          "\"3D Data\" means data produced by us by Scanning the Property (meaning data that allows the Property to be viewed three-dimensionally, whether by 3D Gaussian Splatting or any other method) and data derived therefrom (including point clouds, meshes, LODs, compressed versions, preview videos, still images, semantic information and the like).",
          "\"Facility Information\" means the name, location, fees, equipment, photographs and other information concerning the Property.",
          "\"Individual Sale\" means the sale of 3D Data by download on the Service (not including the provision of online viewing or Scanning services).",
          "\"Hosting Service\" means the services provided by us to the Facility Operator free of charge as standard features of the Service, such as issuing limited-sharing URLs for the 3D Data of the Property, embedding in the Facility Operator's website, and viewing analytics.",
          "\"Purchasers\" means persons who have purchased 3D Data through an Individual Sale and persons who have acquired viewing rights to 3D Data on the Service.",
          "\"Intellectual Property Rights\" means copyrights, patent rights, utility model rights, trademark rights, design rights, technical or business information useful for business activities (including trade secrets) and other rights relating to intellectual creations (including the right to acquire such rights or to apply for registration or the like of such rights)."
        ]
      }
    ]
  },
  {
    "title": "Formation of the Agreement",
    "numbered": true,
    "paras": [
      "Before the Scanning of the Property is carried out, the Applicant shall apply to us for listing on the Service by agreeing to comply with these Terms and submitting the Application Form to us (including submission by electromagnetic means).",
      "An application must be made by the person operating the Property (including a person entrusted with the operation of, or leasing, the Property from its owner) itself, and, in principle, applications by an agent are not permitted. In making an application, the Applicant must provide us with true, accurate and up-to-date information.",
      "We will determine whether to accept an application in accordance with our criteria and, if we accept it, will notify the Applicant to that effect by e-mail or any other method prescribed by us. Upon such notice, the Agreement is formed between the Applicant and us. If we do not accept an application, we are not obliged to disclose the reason therefor.",
      "If the Facility Operator does not give Listing Approval, request revisions or otherwise respond within 14 days from the date on which we sent the Review URL, we shall request the Facility Operator to confirm again, and if there is still no response within 7 days from the date of such reconfirmation, the Facility Operator shall be deemed to have given Listing Approval. However, this paragraph shall not be deemed to grant permission for Individual Sale.",
      "If the Facility Operator is granted an account on the Service, the Facility Operator may not allow any third party to use it, or lend, transfer, sell, pledge or otherwise dispose of it."
    ]
  },
  {
    "title": "Performance of Scanning",
    "numbered": true,
    "paras": [
      "We will carry out the Scanning of the Property at our own cost and responsibility and list the Property on the Service.",
      "The date and time, scope, capture method (LiDAR, multi-camera, drone aerial photography, etc.) and other conditions of the Scanning shall be determined through consultation between the Facility Operator and us.",
      "In connection with the Scanning, the Facility Operator shall provide, free of charge, access to the Property and any other cooperation reasonably required by us.",
      "At the time of Scanning, the Facility Operator shall take reasonable measures, such as clearing the area of people, to ensure that employees, visitors and other third parties are not captured within the Property.",
      "If any part of the Property should not be made public for crime-prevention or security reasons (security equipment, safes, back-office areas, etc.), the Facility Operator shall notify us before the Scanning is carried out, and we will exclude such part from the scope of the Scanning or apply masking or other processing.",
      "When performing Scanning using a drone, we shall comply with the Civil Aeronautics Act and other applicable laws and regulations and obtain any necessary permission or approval. The Facility Operator shall, at our request, give the consents and provide the information necessary therefor.",
      "In carrying out the Scanning, we shall handle the equipment, fixtures and the like of the Property with the care of a prudent manager. If we damage the building, equipment, fixtures or the like of the Property due to reasons attributable to us, we shall compensate the Facility Operator for the damage incurred thereby, the scope and upper limit of which shall be as provided in Article 18, item 2, except in the case of our wilful misconduct or gross negligence.",
      {
        "text": "If we reasonably determine that any of the following items applies, we may suspend, postpone or change the capture method of all or part of the Scanning, or withhold the listing of the Property.",
        "items": [
          "Where the permission or approval necessary for flying a drone under the Civil Aeronautics Act or other applicable laws and regulations cannot be obtained",
          "Where Scanning is technically difficult due to the structure, lighting, reflective objects or other conditions of the Property",
          "Where, due to weather, the condition of the Property or other reasons, it is difficult to carry out the Scanning while ensuring the safety of persons or of the Property",
          "Where there are any other reasons equivalent to those in the preceding items"
        ]
      }
    ]
  },
  {
    "title": "Scanning and Scanning Fees",
    "numbered": true,
    "paras": [
      "The fee for Scanning the Property (meaning capture and production of 3D Data) shall be free of charge, or shall be an amount individually agreed between us and the Facility Operator for each Property before the Scanning is carried out.",
      "The preceding paragraph applies to Scanning that we plan and carry out on our own initiative for the purpose of listing on the Service. The preceding paragraph does not apply to Scanning carried out at the request of the Facility Operator for the purpose of delivering 3D Data to the Facility Operator (a \"Commissioned Scan\"), and the content and fees of a Commissioned Scan shall be governed by an individual contract separately entered into between us and the Facility Operator.",
      "The Agreement does not grant us any exclusive right with respect to the Scanning or listing of the Property. Regardless of whether a Scanning fee is charged, the Facility Operator may freely permit third parties other than us to Scan and list the Property and to sell or otherwise use the data produced by such Scanning."
    ]
  },
  {
    "title": "Listing and Hosting Service",
    "numbered": true,
    "paras": [
      "We will produce the listing page for the Property, list it on the Service, store, deliver and maintain the 3D Data, and provide the Hosting Service, in each case free of charge as standard features of the Service.",
      "The Facility Operator may use the embed code and the like provided by us only on websites and the like operated by the Facility Operator itself, in accordance with the terms of use prescribed by us.",
      "Except as provided in the preceding Article and this Article, we will not require the Facility Operator to bear any costs relating to the Service."
    ]
  },
  {
    "title": "Payment Method",
    "numbered": true,
    "paras": [
      "Any paid Scanning fee individually agreed with the Facility Operator and any other money payable by the Facility Operator to us under these Terms shall be paid, in accordance with the invoice issued by us, by bank transfer to the bank account designated by us by the payment due date stated in the invoice, and bank transfer fees and other costs necessary for payment shall be borne by the Facility Operator.",
      "If the Facility Operator delays the payment under the preceding paragraph, the Facility Operator shall pay us late payment damages at the rate of 14.6% per annum."
    ]
  },
  {
    "title": "Ownership of Rights in 3D Data",
    "numbered": true,
    "paras": [
      "Copyright (including the rights provided in Articles 27 and 28 of the Copyright Act) and all other Intellectual Property Rights in 3D Data belong to us or to persons who have licensed their use to us. However, the ownership and licensing of rights in 3D Data produced through a Commissioned Scan and delivered to the Facility Operator or another recipient (\"Commissioned Deliverables\") shall be governed by the individual contract referred to in Article 5, paragraph 2, and we may, in accordance with such individual contract, transfer rights in, or license the use of, the Commissioned Deliverables to the recipient.",
      "The Facility Operator may use the preview videos and still images provided by us free of charge within the scope of its own publicity and sales purposes. However, the Facility Operator may not reproduce, redistribute or provide to any third party the 3D Data itself.",
      "If the Facility Operator wishes to receive delivery (purchase) of the 3D Data itself, this shall be subject to conditions separately prescribed by us.",
      "With respect to copyrights and other rights held by the Facility Operator in the buildings, interior, designs and other aspects of the Property, the Facility Operator grants, free of charge, permission for us to Scan the Property and produce 3D Data, for us and persons who have licensed us to use 3D Data to use it in accordance with these Terms, and for Purchasers and third parties provided with it under Article 11 to use the 3D Data, and shall not exercise such rights (including moral rights of authors) against these persons.",
      "Intellectual Property Rights in the programs, designs, viewers and other content constituting the Service (excluding 3D Data and Facility Information) belong to us or to third parties who have licensed their use to us, and the Facility Operator shall not reproduce, reprint, modify, adapt or otherwise make secondary use of them."
    ]
  },
  {
    "title": "Listing of 3D Data and Facility Information",
    "numbered": true,
    "paras": [
      "We may list 3D Data on the Service and make it available for online viewing to users of the Service, free of charge or for a fee (including the granting of viewing rights on a subscription basis). The conditions (including fees) for providing online viewing shall be determined by us.",
      "After the Scanning of the Property is carried out, we shall send the Facility Operator a URL for reviewing the listing content of the Property (including the 3D Data and Facility Information) (the \"Review URL\"), and, notwithstanding the preceding paragraph, until the Facility Operator approves such listing content (\"Listing Approval\"), we will not publish the 3D Data or Facility Information of the Property on the Service and will not conduct any Individual Sale. If the Facility Operator does not give Listing Approval, request revisions or otherwise respond within 14 days from the date on which we sent the Review URL, we shall request the Facility Operator to confirm again, and if there is still no response within 7 days from the date of such reconfirmation, the Facility Operator shall be deemed to have given Listing Approval. However, this paragraph shall not be deemed to grant permission for Individual Sale. If revisions are requested, we will make revisions to a reasonable extent and send a Review URL again. This paragraph applies mutatis mutandis to the publication of 3D Data of the Property newly produced or updated by us (including by re-Scanning).",
      "The Facility Operator permits us to list the Facility Information on the Service and warrants that its content is accurate.",
      "Photographs of the Property that we may use on the Service shall be limited to photographs provided to us by the Facility Operator and photographs quoted by us from the official website or the like of the Property and approved by the Facility Operator (such photographs, together with text and other materials provided to us by the Facility Operator, the \"Supplied Materials\"). Copyright in the Supplied Materials is reserved to the Facility Operator or the legitimate right holder, and we do not acquire it. The Facility Operator grants us a non-exclusive licence to use the Supplied Materials free of charge (including reproduction, public transmission, etc.), only during the listing period of the Property and to the extent necessary for the operation and promotion of the Service. We may modify the Supplied Materials only to the extent necessary for display, such as cropping, resizing and brightness adjustment, and the Facility Operator shall not exercise moral rights of authors against us or persons designated by us with respect to modifications within such scope. After the listing ends, we shall not make any new use of the Supplied Materials. However, this does not apply to use in printed materials distributed and articles published before the listing ends.",
      "Updates to Facility Information will be reflected by us within a reasonable period upon the Facility Operator's request.",
      "We may determine, at our discretion, the display method, listing position, listing order and other manner of listing of Facility Information.",
      "Reservations and use contracts for the Property for which inquiries are received through the Service shall be made directly between the Facility Operator and its counterparty, and we shall not be a party thereto."
    ]
  },
  {
    "title": "Individual Sale of Data and Revenue Sharing",
    "numbered": true,
    "paras": [
      "We may conduct Individual Sales of the 3D Data of the Property on the Service only if, for each Property, we have obtained prior permission for Individual Sale from the Facility Operator by a method prescribed by us (including the Application Form, approval on the Review URL, e-mail and other electromagnetic means). Listing Approval and other consents relating to the listing of the Property do not include permission for Individual Sale, and if the Facility Operator does not permit Individual Sale, the 3D Data will be used only for online viewing on the Service and for use by the Facility Operator.",
      "When an Individual Sale is concluded, we will pay the Facility Operator an amount equal to 20% of the sales price received by us from the purchaser (excluding amounts equivalent to consumption tax and local consumption tax) (the \"Revenue Share\").",
      "We shall settle the Revenue Share semi-annually (closing on the last day of June and December each year, payable by the last day of the month following the month in which the closing date falls), and if the settlement amount for any one settlement is less than JPY 10,000, it will be carried forward to the next settlement. However, if the Agreement terminates, we will pay the Revenue Share accrued up to the termination date of the Agreement (including amounts carried forward), regardless of the settlement amount, in the settlement for the half-year in which the termination date falls. Revenue Share arising from Individual Sales under Article 14, paragraph 4 after termination of the Agreement shall be settled in accordance with the main text of this paragraph. Bank transfer fees for settlements shall be borne by us.",
      "The Revenue Share is an amount exclusive of consumption tax and local consumption tax (\"Consumption Taxes\"), and we will pay the Revenue Share plus an amount equivalent to Consumption Taxes. However, if withholding is required by law, we will pay the remaining amount after withholding income tax and the like in accordance with law.",
      "For each settlement, we will deliver to the Facility Operator a payment notice stating the amount of the Revenue Share, the amount equivalent to Consumption Taxes and other matters prescribed by law. If the Facility Operator is a qualified invoice issuer, the Facility Operator shall notify us of its registration number by a method prescribed by us, and such payment notice shall be treated as a purchase statement. If there is any error in the content of a payment notice, the Facility Operator shall notify us within 14 days from the date of receipt, and if no such notice is given within such period, the Facility Operator shall be deemed to have confirmed such content. If the Facility Operator's registration number changes, its registration is cancelled or lapses, or it otherwise ceases to be a qualified invoice issuer, the Facility Operator shall promptly notify us.",
      "The sales price of 3D Data shall be in accordance with a price list separately established by us, and we may determine discounts and other sales conditions. The conditions of use of 3D Data by Purchasers shall be governed by the data purchase terms separately established by us.",
      "We do not guarantee that any Individual Sale will be concluded or its amount.",
      "The Facility Operator shall register the bank account for receipt of the Revenue Share by a method prescribed by us, and we shall not be responsible if payment cannot be made due to the absence of registration or errors in the registered details. If we are unable to pay the Revenue Share for reasons not attributable to us, such as the dissolution or discontinuation of business of the Facility Operator, or the Facility Operator's failure to notify us of a change in its contact details or bank account, we shall send a notice regarding the payment to the e-mail address and postal address notified by the Facility Operator, and if the Facility Operator does not notify us of a bank account within one year from the date on which such notice was sent, the Facility Operator's claim for such Revenue Share shall be extinguished. This paragraph applies regardless of whether before or after termination of the Agreement and regardless of whether the Property has been closed.",
      "The Facility Operator may withdraw its permission for Individual Sale at any time by notifying us by a method prescribed by us. Upon receipt of such notice, we will promptly stop Individual Sales and will thereafter make no new Individual Sales of the 3D Data of the Property. Licences acquired by Purchasers based on Individual Sales concluded before the withdrawal shall survive the withdrawal."
    ]
  },
  {
    "title": "AI Training and Technology Development Uses",
    "numbered": true,
    "paras": [
      {
        "text": "We may ourselves use 3D Data (including derived data) for the purposes set forth in the following items, solely for internal use aimed at improving the Service, and the Facility Operator consents thereto. In addition, only if the Facility Operator has permitted provision to third parties in the Application Form, when we receive an inquiry from a third party and individually enter into a written contract with such third party, we may provide 3D Data to such third party for the purposes set forth in the following items based on such contract.",
        "items": [
          "Training of machine learning and artificial intelligence models, simulation, robotics and autonomous systems, and other technology development",
          "Processing, reproduction, adaptation, compilation into datasets and generation of synthetic data incidental to the preceding item"
        ]
      },
      "When providing 3D Data to a third party under the preceding paragraph, we will not disclose to such third party the name or location of the Property or any other information that could identify the Facility Operator without the Facility Operator's prior written consent.",
      "The Facility Operator shall reasonably cooperate so that personal information, likenesses or trade secrets of third parties are not included in the 3D Data at the time of Scanning. If any of these are included, we will use the 3D Data after removing or anonymising them.",
      "With respect to consideration received by us from a third party for provision to such third party under paragraph 1 (excluding tax and after deduction of payment processing fees), we will pay 20% thereof to the Facility Operator. Article 10, paragraphs 3 to 5 and paragraph 8 apply mutatis mutandis to the settlement of such Revenue Share and the bank account for payment."
    ]
  },
  {
    "title": "Representations and Warranties",
    "numbered": true,
    "paras": [
      "The Facility Operator represents and warrants that it has the authority (including the consent of the owner of the Property and other right holders) necessary for the Scanning of the Property and for the listing, delivery and sale of 3D Data and its use under the preceding Article.",
      "If any claim or other demand is made against us by a third party due to the Facility Operator's breach of this Article, the Facility Operator shall resolve it at its own cost and responsibility and compensate us for any damage incurred by us."
    ]
  },
  {
    "title": "Prohibited Acts",
    "numbered": true,
    "paras": [
      {
        "text": "In using the Service, the Facility Operator shall not engage in any of the acts set forth in the following items.",
        "items": [
          "Acts that violate these Terms",
          "Acts that infringe or may infringe property rights, Intellectual Property Rights, rights of publicity, privacy rights or other rights or interests of us or third parties",
          "Acts of providing false or misleading Facility Information",
          "Acts of extracting, reproducing, modifying or analysing (including reverse engineering) 3D Data from the Service, viewers or the like, or providing it to third parties (except to the extent permitted under Article 8, paragraph 2)",
          "Unauthorised access to our systems, distribution of computer viruses, imposing excessive load, and other acts that interfere or may interfere with the operation of the Service",
          "Acts that violate laws and regulations, public order and morals, or the internal rules of an industry association to which the Facility Operator belongs",
          "Acts related to criminal acts",
          "Acts that damage or may damage the credibility of us or the Service",
          "Other acts that we reasonably determine to be inappropriate"
        ]
      },
      {
        "text": "If we determine that an act of the Facility Operator falls under any of the items of the preceding paragraph, we may, without prior notice, take any or all of the measures set forth in the following items.",
        "items": [
          "Suspension or deletion of all or part of the listing of the Property, publication of 3D Data or Individual Sales",
          "Termination of the Agreement",
          "Other measures that we reasonably determine to be necessary"
        ]
      }
    ]
  },
  {
    "title": "Suspension and Deletion of Listings",
    "numbered": true,
    "paras": [
      {
        "text": "In any of the cases set forth in the following items, we may suspend or delete all or part of the listing of the Property, publication of 3D Data or Individual Sales. In such case, we will notify the Facility Operator in advance, except in an emergency.",
        "items": [
          "Where we determine that the Facility Information is contrary to fact or inaccurate",
          "Where a third party makes a claim of infringement of rights or other demand, and we determine that it is necessary",
          "Where, due to closure, renovation or other reasons concerning the Property, the 3D Data has come to differ significantly from the current state of the Property",
          "Other cases where we reasonably determine that it is necessary"
        ]
      },
      "If the closure or renovation of the Property, a change of its name or operator, or any other event affecting the Facility Information or 3D Data occurs or is expected to occur, the Facility Operator will promptly notify us.",
      "Whether re-Scanning is required in connection with renovation or the like of the Property, its timing and the allocation of its cost shall be determined through consultation between us and the Facility Operator.",
      "Even if, during the term of the Agreement, the Property is closed or the Facility Operator discontinues its business or is dissolved (including where the Agreement terminates as a result thereof), we may list the 3D Data of the Property on the Service with an indication that it is a closed facility and make it available for online viewing. In this case, if the Facility Operator had permitted Individual Sale before the closure, discontinuation of business or dissolution, such permission shall survive termination of the Agreement, and we will continue Individual Sales and pay the Revenue Share in accordance with Article 10. However, this does not apply if the Facility Operator has withdrawn its permission under Article 10, paragraph 9 or has requested suspension or deletion of the listing under Article 15, paragraph 3."
    ]
  },
  {
    "title": "Term and Early Cancellation",
    "numbered": true,
    "paras": [
      "The term of the Agreement shall be two years from the date of formation of the Agreement, and unless either party gives written notice (including by electromagnetic means) no later than three months before the expiry of the term, the Agreement shall be automatically renewed for one year on the same terms, and likewise thereafter.",
      "The Facility Operator may cancel the Agreement before expiry by notifying us at least three months in advance by a method prescribed by us.",
      "Notwithstanding the preceding paragraphs, the Facility Operator may, for any reason and at any time, request suspension or deletion of the listing of the Property by a method prescribed by us, and we will, within five business days from the date of receipt of such request, stop publication of the 3D Data and Facility Information of the Property on the Service and Individual Sales. Even in this case, the Agreement shall continue until it terminates under paragraph 1, the preceding paragraph or any other provision of these Terms, and licences acquired by Purchasers based on Individual Sales concluded before such stop shall not be affected.",
      "Even if the Agreement terminates, use by Purchasers based on Individual Sales and subscription viewing rights concluded before termination of the Agreement shall continue until the contract with such Purchasers terminates.",
      "Even after termination of the Agreement, the rights relating to 3D Data provided in Article 8, and use under Article 11 (limited to use in a manner that does not disclose information that could identify the Facility Operator in accordance with paragraph 2 of that Article), shall survive."
    ]
  },
  {
    "title": "Termination",
    "numbered": true,
    "paras": [
      {
        "text": "If any of the events set forth in the following items occurs with respect to the other party, a party to the Agreement may immediately terminate the Agreement by written notice to the other party without any demand.",
        "items": [
          "When the other party breaches the Agreement and fails to cure such breach within 14 days after receiving a notice requesting cure",
          "When the other party suspends payments or becomes insolvent, or a petition is filed for commencement of bankruptcy proceedings, civil rehabilitation proceedings, corporate reorganisation proceedings, special liquidation proceedings or any other similar proceedings",
          "When a bill or cheque drawn or accepted by the other party is dishonoured, or the other party is subject to a suspension of transactions by a clearing house or any other similar measure",
          "When the other party receives an order of provisional attachment or provisional disposition, or is subject to a petition for attachment or auction",
          "When the other party is subject to a disposition for delinquent taxes and public dues",
          "When the other party is dissolved (except in the case of a merger)",
          "When the other party is subject to a disposition by a supervisory authority such as suspension of business or revocation of a business licence or business registration",
          "When there are reasonable grounds to believe that the other party's assets or credit standing have deteriorated or are likely to deteriorate",
          "When the other party commits a material breach of, or an act of bad faith with respect to, the Agreement",
          "When any other event equivalent to those in the preceding items occurs"
        ]
      },
      "Termination of the Agreement shall take effect prospectively, and even if the Agreement is terminated, the parties shall not be obliged to refund any fees already received as of the time of termination.",
      "If any of the events set forth in the items of paragraph 1 occurs with respect to the Facility Operator, the Facility Operator's obligations to us shall automatically become due and payable, and the Facility Operator must immediately pay all such obligations to us."
    ]
  },
  {
    "title": "No Warranty and Disclaimer",
    "numbered": true,
    "paras": [
      "We do not warrant the completeness, accuracy, usefulness or the like of the Service and 3D Data, and do not warrant that no interruption, suspension or other failure will occur in the Service.",
      "The Facility Operator acknowledges in advance that 3D Data reproduces the state of the Property at the time of Scanning within the limits of the characteristics of the measurement technology, and that dimensions, shapes, colours, textures and the like may differ from the actual object.",
      "We do not guarantee any number of views, inquiries or reservations or any other customer-attraction effect from listing on the Service, or that any Individual Sale will be concluded.",
      "We shall not be liable even if the Facility Operator suffers damage due to its failure to notify us of changes in Facility Information or other notified matters.",
      "If a dispute arises between Purchasers or other users of the Service and the Facility Operator regarding the use, reservation, fees or the like of the Property, such dispute shall be resolved between the parties thereto, and we shall not be liable. However, we will cooperate to a reasonable extent as necessary.",
      "We shall not be liable if performance of all or part of the Agreement is delayed or becomes impossible due to natural disasters, acts of God, fire, strikes, trade embargoes, war, civil disturbance, epidemics of infectious disease or other force majeure.",
      "If we suspend, postpone or change the capture method of all or part of the Scanning, or withhold the listing of the Property, under Article 4, paragraph 8, we shall not be liable for any damage incurred by the Facility Operator as a result."
    ]
  },
  {
    "title": "Damages",
    "numbered": false,
    "paras": [
      {
        "text": "Notwithstanding any other provision of these Terms, if we cause damage to the Facility Operator due to reasons attributable to us, we shall be liable to compensate for such damage only within the scope set forth in the following items.",
        "items": [
          "In the case of our wilful misconduct or gross negligence: the full amount of such damage",
          "In the case of our ordinary negligence: within the scope of ordinary damage actually and directly incurred (excluding special damages, lost profits, indirect damages and attorneys' fees), with an upper limit equal to the total amount of consideration actually received by us from the Facility Operator during the one-year period preceding the date on which the damage occurred."
        ]
      }
    ]
  },
  {
    "title": "Change, Interruption and Discontinuation of the Service",
    "numbered": true,
    "paras": [
      "We may change all or part of the content or specifications of the Service. However, if we make a change that would cause material disadvantage to the Facility Operator, we will notify the Facility Operator in advance.",
      "We may discontinue the provision of all or part of the Service. In this case, we will, in principle, notify the Facility Operator at least one month before the discontinuation.",
      {
        "text": "If any of the following events occurs, we may interrupt all or part of the Service without prior notice to the Facility Operator.",
        "items": [
          "Where maintenance or repair of the Service and the communication equipment and facilities for the Service is carried out on a regular or emergency basis",
          "Where load is concentrated on the system due to excessive access or other unexpected factors",
          "Where it becomes necessary to ensure the security of the Service",
          "Where services of telecommunications carriers, cloud service providers or the like are not provided",
          "Where provision of the Service becomes difficult due to natural disasters such as earthquakes and floods, fire, power outages or other unforeseen accidents, or force majeure such as war, conflict, upheaval, riots or labour disputes",
          "Where operation of the Service becomes impossible due to laws and regulations or measures based thereon",
          "Other cases equivalent to the preceding items where we determine it necessary"
        ]
      }
    ]
  },
  {
    "title": "Confidentiality",
    "numbered": true,
    "paras": [
      "The Facility Operator and we shall strictly and properly manage the other party's confidential information learned in connection with the provision or use of the Service (including know-how relating to the Service, information relating to our systems, and all technical or business confidential information), and shall not disclose, provide or leak it to any third party (including our affiliates) without the other party's prior written consent, or use it for any purpose other than the provision or use of the Service.",
      {
        "text": "The information set forth in the following items does not constitute confidential information.",
        "items": [
          "Information already in the receiving party's possession at the time of disclosure",
          "Information already publicly known at the time of disclosure, or that subsequently becomes publicly known for reasons not attributable to the receiving party",
          "Information lawfully obtained from a third party after disclosure",
          "Information independently developed or created without relying on the disclosed confidential information",
          "Facility Information and 3D Data scheduled to be published on the Service under these Terms"
        ]
      },
      "If instructed by the other party or if the Agreement terminates, the Facility Operator and we shall promptly return or destroy the confidential information in accordance with the other party's instructions and shall not use it thereafter.",
      "We may use the Facility Operator's confidential information for the purpose of providing the Service.",
      "Notwithstanding paragraph 1, we may disclose confidential information, only to the extent necessary for the Service, to our officers and employees, contractors engaged in work relating to the Service, our business partners who introduced the Property to us, and attorneys, certified public accountants, tax accountants and other professionals bound by statutory confidentiality obligations.",
      "If a third party receiving disclosure of confidential information under the preceding paragraph is not bound by statutory confidentiality obligations, we shall impose on such third party confidentiality obligations equivalent to the confidentiality obligations under these Terms and cause it to comply with them.",
      "Notwithstanding paragraph 1, if the Facility Operator or we are required to disclose confidential information by laws and regulations, or by rules, judgments, orders, instructions or the like of a court, administrative agency or public body with regulatory authority, it may disclose confidential information to the extent necessary."
    ]
  },
  {
    "title": "Handling of Personal Information",
    "numbered": false,
    "paras": [
      "We will handle personal information of the Facility Operator's personnel in charge and other related persons in accordance with the privacy policy separately established by us."
    ]
  },
  {
    "title": "Exclusion of Antisocial Forces",
    "numbered": true,
    "paras": [
      {
        "text": "The Facility Operator and we each represent that it does not currently fall under any of the following: an organised crime group, a member of an organised crime group, a person for whom five years have not elapsed since ceasing to be a member of an organised crime group, an associate member of an organised crime group, a company related to an organised crime group, a corporate racketeer (sokaiya) or the like, a rogue purporting to be a social or political activist, a special intelligence violent group or the like, or any other person equivalent thereto (collectively, \"Antisocial Forces\"), and that it does not fall under any of the following items, and warrants that it will not fall under any of them in the future.",
        "items": [
          "Having a relationship in which Antisocial Forces are deemed to control its management.",
          "Having a relationship in which Antisocial Forces are deemed to be substantially involved in its management.",
          "Having a relationship in which it is deemed to be unjustly using Antisocial Forces, such as for the purpose of obtaining unjust profit for itself, its company or a third party, or of causing damage to a third party.",
          "Having a relationship in which it is deemed to be involved with Antisocial Forces, such as by providing funds or the like or granting favours to Antisocial Forces.",
          "Its officers or persons substantially involved in its management having a socially reprehensible relationship with Antisocial Forces."
        ]
      },
      {
        "text": "The Facility Operator and we each covenant that it will not, by itself or through a third party, engage in any of the acts set forth in the following items.",
        "items": [
          "Violent demands",
          "Unjust demands exceeding legal liability",
          "Threatening words or deeds or use of violence in connection with transactions",
          "Acts of damaging the credibility of the other party or obstructing the other party's business by spreading rumours, using fraudulent means or using force",
          "Other acts equivalent to those in the preceding items"
        ]
      },
      "If it is discovered that the other party is Antisocial Forces or falls under any of the items of paragraph 1, has engaged in any act falling under any of the items of the preceding paragraph, or has made a false statement regarding the representations and warranties under paragraph 1, the Facility Operator or we, as the case may be, may terminate the Agreement without any demand to the other party, regardless of whether there is any reason attributable to itself.",
      "The Facility Operator and we each confirm and accept that, if it terminates the Agreement under the preceding paragraph, it shall have no liability whatsoever to compensate the other party for any damage incurred by the other party."
    ]
  },
  {
    "title": "Assignment of Contractual Position",
    "numbered": true,
    "paras": [
      "Neither the Facility Operator nor we may assign, transfer, create a security interest in or otherwise dispose of, to any third party, its contractual position under the Agreement or all or part of its rights or obligations under these Terms without the other party's prior written consent.",
      "Notwithstanding the preceding paragraph, if we cause a third party to succeed to the business relating to the Service by merger, company split, business transfer or any other method, we may cause such successor to succeed to our contractual position under the Agreement, our rights and obligations under these Terms (including rights relating to 3D Data) and the Facility Operator's registration information and other information, and the Facility Operator consents thereto in advance."
    ]
  },
  {
    "title": "Notices",
    "numbered": true,
    "paras": [
      "Notices from us to the Facility Operator shall be given by sending them to the e-mail address stated in the Application Form or notified to us, by posting on the Service, or by any other method we deem appropriate. A notice by e-mail shall be deemed to have arrived at the time when such e-mail would normally arrive.",
      "If any matter stated in the Application Form (name, location, person in charge, contact details, bank account for payment, etc.) changes, the Facility Operator shall promptly notify us by a method prescribed by us. We shall not be liable even if the Facility Operator suffers any disadvantage due to its failure to give such notice."
    ]
  },
  {
    "title": "Severability",
    "numbered": false,
    "paras": [
      "Even if any provision of the Agreement or any part thereof is held invalid or unenforceable, the remaining provisions of the Agreement and the remaining part of any provision held partially invalid or unenforceable shall continue in full force and effect, and the parties to the Agreement shall endeavour to amend such invalid or unenforceable provision or part to the extent necessary to make it lawful and enforceable, and to secure the intent of such invalid or unenforceable provision or part and an equivalent legal and economic effect."
    ]
  },
  {
    "title": "Survival",
    "numbered": false,
    "paras": [
      "The provisions of Article 7 (only where unpaid amounts remain), Article 8, Article 9, paragraph 4, Article 10 (only to the extent relating to Individual Sales concluded before termination of the Agreement and Individual Sales conducted after termination of the Agreement under Article 14, paragraph 4), Article 11, Article 12, paragraph 2, Article 14, paragraph 4, Article 15, paragraphs 3 to 5, Article 16, paragraphs 2 and 3, Article 17, Article 18, Article 20, Article 21, Article 22, paragraphs 3 and 4, Article 23, Article 25, this Article, Article 28 and Article 29 shall survive termination of the Agreement."
    ]
  },
  {
    "title": "Amendment of these Terms",
    "numbered": true,
    "paras": [
      {
        "text": "We may amend these Terms pursuant to Article 548-4 of the Civil Code in any of the cases set forth in the following items. After these Terms are amended, the amended Terms shall apply to the Agreement.",
        "items": [
          "When the amendment of these Terms conforms to the general interests of Facility Operators.",
          "When the amendment of these Terms does not contravene the purpose of the contract and is reasonable in light of the necessity of the amendment, the appropriateness of the amended content, the content of the amendment and other circumstances relating to the amendment."
        ]
      },
      "When amending these Terms, we will set the effective date of the amended Terms and, no later than one month before the effective date, make known the content of the amended Terms and the effective date by notice to the Facility Operator, display on the Service or any other method prescribed by us.",
      "If the Facility Operator does not agree to the amendment of these Terms, it may cancel the Agreement by notifying us by a method prescribed by us no later than the day before the effective date.",
      "If the effective date passes without the Facility Operator making the cancellation under the preceding paragraph, the Facility Operator shall be deemed to have agreed to the amendment of these Terms."
    ]
  },
  {
    "title": "Governing Law",
    "numbered": false,
    "paras": [
      "These Terms and the Agreement shall be governed by the laws of Japan."
    ]
  },
  {
    "title": "Jurisdiction",
    "numbered": false,
    "paras": [
      "The Tokyo District Court shall have exclusive agreed jurisdiction as the court of first instance over all disputes arising out of or in connection with the Agreement."
    ]
  },
  {
    "title": "Consultation and Miscellaneous",
    "numbered": true,
    "paras": [
      "With respect to matters not provided for in these Terms, if we separately establish detailed rules or the like, the Facility Operator shall comply with them. In this case, such detailed rules or the like shall form an integral part of these Terms.",
      "Matters not provided for in these Terms or matters on which doubt arises as to the interpretation of these Terms shall be resolved through good-faith consultation between us and the Facility Operator."
    ]
  }
];
