/**
 * Official SuperOps MSP GraphQL mutation documents for the Phase 2 write surface.
 * Association JSON scalars are leaf-selected. Hard-delete and generic mutation
 * documents are intentionally absent.
 */

const TICKET_FIELDS = `
    ticketId
    displayId
    subject
    ticketType
    requestType
    source
    client
    site
    requester
    techGroup
    technician
    status
    priority
    impact
    urgency
    category
    subcategory
    cause
    resolutionCode
    sla
    createdTime
    updatedTime`;

const NOTE_FIELDS = `
    noteId
    addedBy
    addedOn
    content
    privacyType`;

const WORKLOG_FIELDS = `
    itemId
    status
    serviceItem
    billable
    afterHours
    qty
    unitPrice
    billDateTime
    technician
    notes
    workItem`;

const TASK_FIELDS = `
    taskId
    displayId
    title
    description
    status
    estimatedTime
    scheduledStartDate
    dueDate
    overdue
    actualStartDate
    actualEndDate
    technician
    techGroup
    ticket
    workItem`;

const ITDOC_FIELDS = `
    itDocId
    name
    client
    site
    customFields`;

const KB_ITEM_FIELDS = `
    itemId
    name
    itemType
    description
    status
    createdBy
    createdOn
    lastModifiedBy
    lastModifiedOn
    viewCount
    articleType
    loginRequired
    parent { itemId name }`;

export const CREATE_TICKET = `
mutation createTicket($input: CreateTicketInput!) {
  createTicket(input: $input) {
    ${TICKET_FIELDS}
  }
}
`;

export const UPDATE_TICKET = `
mutation updateTicket($input: UpdateTicketInput!) {
  updateTicket(input: $input) {
    ${TICKET_FIELDS}
  }
}
`;

export const CREATE_NOTE = `
mutation createNote($input: CreateNoteInput!) {
  createNote(input: $input) {
    ${NOTE_FIELDS}
  }
}
`;

export const CREATE_TICKET_CONVERSATION = `
mutation createTicketConversation($input: CreateTicketConversationInput!) {
  createTicketConversation(input: $input) {
    conversationId
    content
    time
    user
    type
  }
}
`;

export const CREATE_WORKLOG_ENTRIES = `
mutation createWorklogEntries($input: [CreateWorklogEntryInput!]!) {
  createWorklogEntries(input: $input) {
    ${WORKLOG_FIELDS}
  }
}
`;

export const UPDATE_WORKLOG_ENTRY = `
mutation updateWorklogEntry($input: UpdateWorklogEntryInput!) {
  updateWorklogEntry(input: $input) {
    ${WORKLOG_FIELDS}
  }
}
`;

export const CREATE_ALERT = `
mutation createAlert($input: CreateAlertInput!) {
  createAlert(input: $input) {
    id
    message
    createdTime
    status
    severity
    description
    asset
    policy
    resolvedTime
    occurrenceCount
  }
}
`;

export const RESOLVE_ALERTS = `
mutation resolveAlerts($input: [ResolveAlertInput]) {
  resolveAlerts(input: $input)
}
`;

export const UPDATE_CLIENT_USER = `
mutation updateClientUser($input: UpdateClientUserInput!) {
  updateClientUser(input: $input) {
    userId
    firstName
    lastName
    name
    contactNumber
    reportingManager
    site
    role
    client
  }
}
`;

export const UPDATE_CLIENT_USER_ASSOCIATIONS = `
mutation updateClientUserAssociations($input: [UpdateClientUserAssociationInput!]!) {
  updateClientUserAssociations(input: $input) {
    id
    client { accountId name }
    site { id name }
    user { userId name }
  }
}
`;

export const UPDATE_ASSET = `
mutation updateAsset($input: UpdateAssetInput!) {
  updateAsset(input: $input) {
    assetId
    name
    assetClass
    client
    site
    requester
  }
}
`;

export const CREATE_TASK = `
mutation createTask($input: CreateTaskInput!) {
  createTask(input: $input) {
    ${TASK_FIELDS}
  }
}
`;

export const CREATE_IT_DOCUMENTATION = `
mutation createItDocumentation($input: CreateItDocumentationInput!) {
  createItDocumentation(input: $input) {
    ${ITDOC_FIELDS}
  }
}
`;

export const UPDATE_IT_DOCUMENTATION = `
mutation updateItDocumentation($input: UpdateItDocumentationInput!) {
  updateItDocumentation(input: $input) {
    ${ITDOC_FIELDS}
  }
}
`;

export const CREATE_KB_ARTICLE = `
mutation createKbArticle($input: CreateKbArticleInput!) {
  createKbArticle(input: $input) {
    ${KB_ITEM_FIELDS}
  }
}
`;

export const CREATE_KB_COLLECTION = `
mutation createKbCollection($input: CreateKbCollectionInput!) {
  createKbCollection(input: $input) {
    itemId
    name
    parent { itemId name }
  }
}
`;

export const UPDATE_KB_COLLECTION = `
mutation updateKbCollection($input: UpdateKbCollectionInput!) {
  updateKbCollection(input: $input) {
    itemId
    name
    parent { itemId name }
  }
}
`;

export const RUN_SCRIPT_ON_ASSET = `
mutation runScriptOnAsset($input: RunScriptInput!) {
  runScriptOnAsset(input: $input) {
    actionConfigId
    script { scriptId name }
    asset { assetId name }
    status
    scheduledTime
  }
}
`;

export const ALL_MUTATION_DOCUMENTS = [
  CREATE_TICKET,
  UPDATE_TICKET,
  CREATE_NOTE,
  CREATE_TICKET_CONVERSATION,
  CREATE_WORKLOG_ENTRIES,
  UPDATE_WORKLOG_ENTRY,
  CREATE_ALERT,
  RESOLVE_ALERTS,
  UPDATE_CLIENT_USER,
  UPDATE_CLIENT_USER_ASSOCIATIONS,
  UPDATE_ASSET,
  CREATE_TASK,
  CREATE_IT_DOCUMENTATION,
  UPDATE_IT_DOCUMENTATION,
  CREATE_KB_ARTICLE,
  CREATE_KB_COLLECTION,
  UPDATE_KB_COLLECTION,
  RUN_SCRIPT_ON_ASSET,
];
