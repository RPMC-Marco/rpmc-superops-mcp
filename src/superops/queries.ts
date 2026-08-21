/**
 * SuperOps GraphQL documents.
 *
 * Substantially adapted from computask/superops-mcp domain query strings
 * (Apache-2.0, commit 85b24ee9f203637b680858cd0abdd1bf5d303f9e).
 * Association fields are selected as leaves (official JSON scalars; Servosity #114).
 * Ticket.description is omitted (absent from the official Ticket type; original body is
 * documented as TicketConversationType.DESCRIPTION).
 * Pagination uses official page / pageSize / hasMore.
 */

export const LIST_INFO = `
      listInfo {
        page
        pageSize
        hasMore
        totalCount
      }`;

export const GET_CLIENT_LIST = `
query getClientList($input: ListInfoInput!) {
  getClientList(input: $input) {
    clients {
      accountId
      name
      stage
      status
      emailDomains
      accountManager
      primaryContact
      hqSite
    }
    ${LIST_INFO}
  }
}
`;

export const GET_CLIENT = `
query getClient($input: ClientIdentifierInput!) {
  getClient(input: $input) {
    accountId
    name
    stage
    status
    emailDomains
    accountManager
    primaryContact
    secondaryContact
    hqSite
    technicianGroups
  }
}
`;

export const GET_TICKET_LIST = `
query getTicketList($input: ListInfoInput!) {
  getTicketList(input: $input) {
    tickets {
      ticketId
      displayId
      subject
      requestType
      source
      client
      requester
      techGroup
      technician
      status
      priority
      impact
      urgency
      category
      createdTime
      updatedTime
    }
    ${LIST_INFO}
  }
}
`;

export const GET_TICKET = `
query getTicket($input: TicketIdentifierInput!) {
  getTicket(input: $input) {
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
    updatedTime
    firstResponseDueTime
    resolutionDueTime
  }
}
`;

export const GET_TICKET_CONVERSATION_LIST = `
query getTicketConversationList($input: TicketIdentifierInput!) {
  getTicketConversationList(input: $input) {
    conversationId
    content
    time
    user
    toUsers { user }
    ccUsers { user }
    bccUsers { user }
    attachments {
      fileName
      originalFileName
      fileSize
    }
    type
  }
}
`;

export const GET_TICKET_NOTE_LIST = `
query getTicketNoteList($input: TicketIdentifierInput!) {
  getTicketNoteList(input: $input) {
    noteId
    addedBy
    addedOn
    content
    attachments {
      fileName
      originalFileName
      fileSize
    }
    privacyType
  }
}
`;

export const GET_ASSET_LIST = `
query getAssetList($input: ListInfoInput!) {
  getAssetList(input: $input) {
    assets {
      assetId
      name
      assetClass
      client
      site
      status
      platform
      lastCommunicatedTime
      patchStatus
      deviceCategory
    }
    ${LIST_INFO}
  }
}
`;

export const GET_ASSET = `
query getAsset($input: AssetIdentifierInput!) {
  getAsset(input: $input) {
    assetId
    name
    assetClass
    client
    site
    requester
    serialNumber
    manufacturer
    model
    hostName
    publicIp
    platform
    status
    lastCommunicatedTime
    agentVersion
    patchStatus
    deviceCategory
  }
}
`;

export const GET_ASSET_SOFTWARE_LIST = `
query getAssetSoftwareList($input: AssetDetailsListInput!) {
  getAssetSoftwareList(input: $input) {
    assetSoftwares {
      id
      software
      version
      installedDate
    }
    ${LIST_INFO}
  }
}
`;

export const GET_ASSET_PATCH_DETAILS = `
query getAssetPatchDetails($input: AssetDetailsListInput!) {
  getAssetPatchDetails(input: $input) {
    assetPatches {
      patchDetail {
        patchId
        title
        category
        severity
        kbNumbers { kbNumber }
        restartRequired
      }
      approvalStatus
      installationStatus
      failedMessage
    }
    ${LIST_INFO}
  }
}
`;

export const GET_ALERT_LIST = `
query GetAlertList($input: ListInfoInput!) {
  getAlertList(input: $input) {
    alerts {
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
    ${LIST_INFO}
  }
}
`;

export const GET_TECHNICIAN_LIST = `
query getTechnicianList($input: ListInfoInput!) {
  getTechnicianList(input: $input) {
    userList {
      userId
      firstName
      lastName
      name
      email
      designation
      role
      team
    }
    ${LIST_INFO}
  }
}
`;

export const GET_TECHNICIAN_GROUP_LIST = `
query getTechnicianGroupList {
  getTechnicianGroupList {
    groupId
    name
  }
}
`;

export const ALL_QUERY_DOCUMENTS = [
  GET_CLIENT_LIST,
  GET_CLIENT,
  GET_TICKET_LIST,
  GET_TICKET,
  GET_TICKET_CONVERSATION_LIST,
  GET_TICKET_NOTE_LIST,
  GET_ASSET_LIST,
  GET_ASSET,
  GET_ASSET_SOFTWARE_LIST,
  GET_ASSET_PATCH_DETAILS,
  GET_ALERT_LIST,
  GET_TECHNICIAN_LIST,
  GET_TECHNICIAN_GROUP_LIST,
];
