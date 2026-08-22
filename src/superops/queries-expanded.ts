/**
 * Official SuperOps MSP GraphQL documents for the Phase 1 read-expansion batch.
 * Association JSON scalars are leaf-selected. Object types use official nested fields.
 */

const LIST_INFO = `
      listInfo {
        page
        pageSize
        hasMore
        totalCount
      }`;

const FIELD_FIELDS = `
    id
    module
    columnName
    label
    description
    fieldType
    showToRequester
    fieldCategory
    mandatoryOnCreate
    mandatoryOnClosure
    options {
      id
      value
      order
    }
    parentField {
      id
      module
      columnName
      label
    }`;

const CLIENT_USER_FIELDS = `
    userId
    firstName
    lastName
    name
    contactNumber
    reportingManager
    site
    role
    client
    customFields`;

const CATALOG_ITEM_FIELDS = `
    itemId
    name
    description
    itemType
    offerAsWorklogItem
    status
    taxable
    category { categoryId name }
    salesTax { taxId name totalRate }
    sellingPrice { model details { value afterHoursValue } }
    costPrice { model details { value afterHoursValue } }
    serviceTypeItem { itemId offeringType }`;

const SERVICE_ITEM_FIELDS = `
    itemId
    name
    description
    quantityType
    useAsWorklogItem
    unitPrice
    businessHoursUnitPrice
    afterHoursUnitPrice
    roundUpValue
    quantity
    amount
    salesTaxEnabled
    category { categoryId name }
    salesTax { taxId name totalRate rates { rateId name rateValue } }`;

const TAX_FIELDS = `
    taxId
    name
    totalRate
    rates { rateId name rateValue }`;

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
    technician { userId name }
    techGroup { groupId name }
    module
    ticket { ticketId displayId subject }
    workItem { workId displayId module }`;

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

const SCRIPT_FIELDS = `
    scriptId
    name
    description
    language
    addedBy
    createdTime
    favourite
    runAs
    runTimeVariables
    timeOut
    tags
    readMe`;

export const GET_ALL_FIELDS = `
query getAllFields($input: String!) {
  getAllFields(input: $input) {
    ${FIELD_FIELDS}
  }
}
`;

export const GET_FIELD = `
query getField($input: FieldIdentifierInput!) {
  getField(input: $input) {
    ${FIELD_FIELDS}
  }
}
`;

export const GET_FIELDS = `
query getFields($input: [FieldIdentifierInput!]!) {
  getFields(input: $input) {
    ${FIELD_FIELDS}
  }
}
`;

export const GET_ASSET_CUSTOM_FIELDS = `
query getAssetCustomFields($input: [String!]) {
  getAssetCustomFields(input: $input) {
    id
    columnName
    label
    description
    fieldType
    showToClient
  }
}
`;

export const GET_ASSET_DISK_DETAILS = `
query getAssetDiskDetails($input: AssetIdentifierInput!) {
  getAssetDiskDetails(input: $input) {
    drive
    discType
    fileSystem
    maxFileLength
    autoMounted
    compressed
    pageFile
    indexed
    size
    freeSize
    activeTime
    responseTime
    readSpeed
    writeSpeed
    driveUsage
  }
}
`;

export const GET_ASSET_USER_LOG = `
query getAssetUserLog($input: AssetIdentifierInput!) {
  getAssetUserLog(input: $input) {
    id
    name
    lastLoginTime
  }
}
`;

export const GET_DEVICE_CATEGORIES = `
query getDeviceCategories($input: DeviceCategoryIdentifierInput) {
  getDeviceCategories(input: $input) {
    deviceCategoryId
    name
    custom
    assetClass
    createdTime
  }
}
`;

export const GET_CLIENT_STAGE_LIST = `
query getClientStageList {
  getClientStageList {
    stageId
    name
    constant
    statuses {
      statusId
      name
      constant
    }
  }
}
`;

export const GET_CLIENT_USER = `
query getClientUser($input: ClientUserIdentifierInput!) {
  getClientUser(input: $input) {
    ${CLIENT_USER_FIELDS}
  }
}
`;

export const GET_CLIENT_USER_LIST = `
query getClientUserList($input: GetClientUserListInput!) {
  getClientUserList(input: $input) {
    userList {
      ${CLIENT_USER_FIELDS}
    }
    ${LIST_INFO}
  }
}
`;

export const GET_CLIENT_USER_ASSOCIATION_LIST = `
query getClientUserAssociationList($input: ListInfoInput!) {
  getClientUserAssociationList(input: $input) {
    associations {
      id
      client { accountId name }
      site { id name }
      user { userId name }
    }
    ${LIST_INFO}
  }
}
`;

export const GET_REQUESTER_ROLE_LIST = `
query getRequesterRoleList {
  getRequesterRoleList {
    roleId
    name
    description
    roleType { roleTypeId name }
  }
}
`;

export const GET_TECHNICIAN_ROLE_LIST = `
query getTechnicianRoleList {
  getTechnicianRoleList {
    roleId
    name
    description
    roleType { roleTypeId name }
  }
}
`;

export const GET_DESIGNATION_LIST = `
query getDesignationList {
  getDesignationList {
    designationId
    name
  }
}
`;

export const GET_TEAM_LIST = `
query getTeamList {
  getTeamList {
    teamId
    name
  }
}
`;

export const GET_BUSINESS_FUNCTION_LIST = `
query getBusinessFunctionList {
  getBusinessFunctionList {
    businessFunctionId
    name
  }
}
`;

export const GET_HOLIDAY_LIST = `
query getHolidayList {
  getHolidayList {
    id
    name
  }
}
`;

export const GET_CLIENT_CONTRACT = `
query getClientContract($input: ContractIdentifierInput!) {
  getClientContract(input: $input) {
    contractId
    client
    contract {
      contractId
      name
      description
      contractType
    }
    startDate
    endDate
    contractStatus
  }
}
`;

export const GET_CLIENT_CONTRACT_LIST = `
query getClientContractList($input: ListInfoInput) {
  getClientContractList(input: $input) {
    clientContracts {
      contractId
      client
      contract {
        contractId
        name
        description
        contractType
      }
      startDate
      endDate
      contractStatus
    }
    ${LIST_INFO}
  }
}
`;

export const GET_SLA_LIST = `
query getSLAList {
  getSLAList {
    id
    name
  }
}
`;

export const GET_OFFERED_ITEMS = `
query getOfferedItems($input: ListInfoInput) {
  getOfferedItems(input: $input) {
    items {
      itemId
      type
      billDate
      status
      serviceItem { itemId name quantityType }
      client { accountId name }
      site { id name }
      workItem { workId displayId module }
      technician { userId name }
      afterHours
      unitPrice
      qty
      discountRate
      amount
      notes
      createdTime
      updatedTime
    }
    ${LIST_INFO}
  }
}
`;

export const GET_SERVICE_CATALOG_ITEM = `
query getServiceCatalogItem($input: ServiceCatalogItemIdentifierInput!) {
  getServiceCatalogItem(input: $input) {
    ${CATALOG_ITEM_FIELDS}
  }
}
`;

export const GET_SERVICE_CATALOG_ITEM_LIST = `
query getServiceCatalogItemList($input: ListInfoInput!) {
  getServiceCatalogItemList(input: $input) {
    items {
      ${CATALOG_ITEM_FIELDS}
    }
    ${LIST_INFO}
  }
}
`;

export const GET_SERVICE_CATEGORY_LIST = `
query getServiceCategoryList {
  getServiceCategoryList {
    categoryId
    name
  }
}
`;

export const GET_SERVICE_ITEM = `
query getServiceItem($input: ServiceItemIdentifierInput!) {
  getServiceItem(input: $input) {
    ${SERVICE_ITEM_FIELDS}
  }
}
`;

export const GET_SERVICE_ITEM_LIST = `
query getServiceItemList($input: ListInfoInput!) {
  getServiceItemList(input: $input) {
    items {
      ${SERVICE_ITEM_FIELDS}
    }
    ${LIST_INFO}
  }
}
`;

export const GET_TAX = `
query getTax($input: TaxIdentifierInput!) {
  getTax(input: $input) {
    ${TAX_FIELDS}
  }
}
`;

export const GET_TAX_LIST = `
query getTaxList($input: ListInfoInput!) {
  getTaxList(input: $input) {
    taxes {
      ${TAX_FIELDS}
    }
    ${LIST_INFO}
  }
}
`;

export const GET_PAYMENT_METHOD_LIST = `
query getPaymentMethodList {
  getPaymentMethodList {
    paymentMethodId
    paymentMethodName
  }
}
`;

export const GET_PAYMENT_TERM_LIST = `
query getPaymentTermList {
  getPaymentTermList {
    paymentTermId
    paymentTermName
    paymentTermValue
  }
}
`;

export const GET_INVOICE = `
query getInvoice($input: InvoiceIdentifierInput!) {
  getInvoice(input: $input) {
    invoiceId
    displayId
    client
    site
    invoiceDate
    dueDate
    statusEnum
    sentToClient
    discountAmount
    additionalDiscount
    additionalDiscountRate
    totalAmount
    notes
    paymentDate
    paymentMethod
    paymentReference
    invoicePaymentTerm
    taxes {
      id
      tax
      taxRate
      taxableAmount
      taxAmount
      rate
    }
    items {
      itemId
      billedDate
      details
      quantity
      unitPrice
      discountRate
      amount
      taxable
    }
  }
}
`;

export const GET_INVOICE_LIST = `
query getInvoiceList($input: ListInfoInput!) {
  getInvoiceList(input: $input) {
    invoices {
      invoiceId
      displayId
      client
      site
      invoiceDate
      dueDate
      statusEnum
      sentToClient
      totalAmount
      paymentDate
    }
    ${LIST_INFO}
  }
}
`;

export const GET_INVOICE_ITEM_LIST = `
query getInvoiceItemList($input: ListInfoInput!) {
  getInvoiceItemList(input: $input) {
    items {
      itemId
      billedDate
      details
      quantity
      unitPrice
      discountRate
      amount
      taxable
    }
    ${LIST_INFO}
  }
}
`;

export const GET_IT_DOCUMENTATION = `
query getItDocumentation($input: ItDocumentationIdentifierInput!) {
  getItDocumentation(input: $input) {
    itDocId
    name
    client
    site
    customFields
  }
}
`;

export const GET_IT_DOCUMENTATION_LIST = `
query getItDocumentationList($input: ItDocumentationListInput!) {
  getItDocumentationList(input: $input) {
    documents {
      itDocId
      name
      client
      site
      customFields
    }
    ${LIST_INFO}
  }
}
`;

export const GET_IT_DOCUMENTATION_CATEGORIES = `
query getItDocumentationCategories {
  getItDocumentationCategories {
    typeId
    name
    description
    entityName
    lastUpdatedTime
    customFields
  }
}
`;

export const GET_KB_ITEM = `
query getKbItem($input: KBItemIdentifierInput!) {
  getKbItem(input: $input) {
    ${KB_ITEM_FIELDS}
    visibility {
      mappingId
      portalType
      clientSharedType
      siteSharedType
      userRoleSharedType
      client
      site
      roles
      userSharedType
      groupSharedType
      users
      groups
    }
  }
}
`;

export const GET_KB_ITEMS = `
query getKbItems($listInfo: ListInfoInput!) {
  getKbItems(listInfo: $listInfo) {
    items {
      ${KB_ITEM_FIELDS}
    }
    ${LIST_INFO}
  }
}
`;

export const GET_SCRIPT_LIST = `
query getScriptList($input: ListInfoInput!) {
  getScriptList(input: $input) {
    scripts {
      ${SCRIPT_FIELDS}
    }
    ${LIST_INFO}
  }
}
`;

export const GET_SCRIPT_LIST_BY_TYPE = `
query getScriptListByType($input: ScriptListByTypeInput!) {
  getScriptListByType(input: $input) {
    scripts {
      ${SCRIPT_FIELDS}
    }
    ${LIST_INFO}
  }
}
`;

export const GET_TASK = `
query getTask($input: GetTaskInput!) {
  getTask(input: $input) {
    ${TASK_FIELDS}
  }
}
`;

export const GET_TASK_LIST = `
query getTaskList($input: GetTaskListInput!) {
  getTaskList(input: $input) {
    tasks {
      ${TASK_FIELDS}
    }
    ${LIST_INFO}
  }
}
`;

export const GET_WORK_STATUS_LIST = `
query getWorkStatusList {
  getWorkStatusList {
    statusId
    name
    state
  }
}
`;

export const GET_WORKLOG_ENTRIES = `
query getWorklogEntries($input: GetWorklogEntriesInput!) {
  getWorklogEntries(input: $input) {
    entries {
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
      workItem
    }
    ${LIST_INFO}
  }
}
`;

export const EXPANDED_QUERY_DOCUMENTS = [
  GET_ALL_FIELDS,
  GET_FIELD,
  GET_FIELDS,
  GET_ASSET_CUSTOM_FIELDS,
  GET_ASSET_DISK_DETAILS,
  GET_ASSET_USER_LOG,
  GET_DEVICE_CATEGORIES,
  GET_CLIENT_STAGE_LIST,
  GET_CLIENT_USER,
  GET_CLIENT_USER_LIST,
  GET_CLIENT_USER_ASSOCIATION_LIST,
  GET_REQUESTER_ROLE_LIST,
  GET_TECHNICIAN_ROLE_LIST,
  GET_DESIGNATION_LIST,
  GET_TEAM_LIST,
  GET_BUSINESS_FUNCTION_LIST,
  GET_HOLIDAY_LIST,
  GET_CLIENT_CONTRACT,
  GET_CLIENT_CONTRACT_LIST,
  GET_SLA_LIST,
  GET_OFFERED_ITEMS,
  GET_SERVICE_CATALOG_ITEM,
  GET_SERVICE_CATALOG_ITEM_LIST,
  GET_SERVICE_CATEGORY_LIST,
  GET_SERVICE_ITEM,
  GET_SERVICE_ITEM_LIST,
  GET_TAX,
  GET_TAX_LIST,
  GET_PAYMENT_METHOD_LIST,
  GET_PAYMENT_TERM_LIST,
  GET_INVOICE,
  GET_INVOICE_LIST,
  GET_INVOICE_ITEM_LIST,
  GET_IT_DOCUMENTATION,
  GET_IT_DOCUMENTATION_LIST,
  GET_IT_DOCUMENTATION_CATEGORIES,
  GET_KB_ITEM,
  GET_KB_ITEMS,
  GET_SCRIPT_LIST,
  GET_SCRIPT_LIST_BY_TYPE,
  GET_TASK,
  GET_TASK_LIST,
  GET_WORK_STATUS_LIST,
  GET_WORKLOG_ENTRIES,
];

export const OBJECT_TYPED_QUERY_DOCUMENTS = [
  GET_CLIENT_USER_ASSOCIATION_LIST,
  GET_REQUESTER_ROLE_LIST,
  GET_TECHNICIAN_ROLE_LIST,
  GET_SERVICE_CATALOG_ITEM,
  GET_SERVICE_CATALOG_ITEM_LIST,
  GET_SERVICE_ITEM,
  GET_SERVICE_ITEM_LIST,
  GET_OFFERED_ITEMS,
  GET_INVOICE,
  GET_KB_ITEM,
  GET_KB_ITEMS,
  GET_TASK,
  GET_TASK_LIST,
  GET_ALL_FIELDS,
  GET_FIELD,
  GET_FIELDS,
];
