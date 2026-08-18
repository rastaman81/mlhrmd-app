const db = require('../config/db');

// =============================================
// ITEM OPERATIONS
// =============================================

async function searchItems(keyword) {
  const searchTerm = `%${keyword}%`;
  const [rows] = await db.default.query(
    `SELECT 
            item_id,
            item_code,
            item_name,
            item_description,
            item_unit,
            item_count AS stock,
            item_order_level
        FROM inventory_items
        WHERE is_active = 1 
            AND (item_name LIKE ? 
                OR item_code LIKE ? 
                OR item_description LIKE ?)
        ORDER BY item_name ASC
        LIMIT 20`,
    [searchTerm, searchTerm, searchTerm],
  );
  return rows;
}

async function getItemById(itemId) {
  const [rows] = await db.default.query(
    `SELECT 
            item_id,
            item_code,
            item_name,
            item_description,
            item_unit,
            item_count AS stock,
            item_order_level
        FROM inventory_items
        WHERE item_id = ? -- AND is_active = 1`,
    [itemId],
  );
  return rows[0] || null;
}

async function getItemStock(itemId) {
  const [rows] = await db.default.query(
    `SELECT item_count FROM inventory_items WHERE item_id = ?`,
    [itemId],
  );
  return rows[0]?.item_count || 0;
}

// =============================================
// REQUEST REASONS OPERATIONS
// =============================================

async function getRequestReasons() {
  const [rows] = await db.default.query(
    `SELECT 
            reason_id,
            reason_code,
            reason_name
        FROM inventory_request_reasons
        WHERE is_active = 1
        ORDER BY display_order ASC, reason_name ASC`,
  );
  return rows;
}

async function getReasonById(reasonId) {
  const [rows] = await db.default.query(
    `SELECT reason_id, reason_name 
        FROM inventory_request_reasons 
        WHERE reason_id = ? AND is_active = 1`,
    [reasonId],
  );
  return rows[0] || null;
}

// =============================================
// REQUEST OPERATIONS
// =============================================

async function generateRequestNumber() {
  const [rows] = await db.default.query(
    `SELECT COUNT(*) as count FROM inventory_requests 
         WHERE YEAR(created_at) = YEAR(NOW())`,
  );
  const count = (rows[0]?.count || 0) + 1;
  const year = new Date().getFullYear();
  return `REQ-${year}-${String(count).padStart(6, '0')}`;
}

async function createRequest({ userId, items, remarks }) {
  const dbPool = getRecordsDbPool('default');
  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    // Generate request number
    const requestNumber = await generateRequestNumber();

    // Calculate total items
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    // Insert request header
    const [headerResult] = await connection.query(
      `INSERT INTO inventory_requests (
                request_number,
                user_id,
                request_date,
                status,
                total_items,
                remarks,
                created_by,
                created_at
            ) VALUES (?, ?, NOW(), 'pending', ?, ?, ?, NOW())`,
      [requestNumber, userId, totalItems, remarks || null, userId],
    );

    const requestId = headerResult.insertId;

    // Insert request items
    for (const item of items) {
      await connection.query(
        `INSERT INTO inventory_request_items (
                    request_id,
                    item_id,
                    quantity,
                    reason_id,
                    custom_reason
                ) VALUES (?, ?, ?, ?, ?)`,
        [
          requestId,
          item.item_id,
          item.quantity,
          item.reason_id || null,
          item.custom_reason || null,
        ],
      );
    }

    await connection.commit();
    return requestId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// SIMPLIFIED getRequestById - No user joins
async function getRequestById(requestId) {
  const [rows] = await db.default.query(
    `SELECT 
            request_id,
            request_number,
            user_id,
            request_date,
            status,
            total_items,
            remarks,
            approved_by,
            approved_date,
            released_by,
            released_date,
            created_at,
            created_by,
            updated_at,
            updated_by
        FROM inventory_requests
        WHERE request_id = ?`,
    [requestId],
  );
  return rows[0] || null;
}

async function getRequestItems(requestId) {
  const [rows] = await db.default.query(
    `SELECT 
            ri.request_item_id,
            ri.request_id,
            ri.item_id,
            ri.quantity,
            ri.reason_id,
            ri.custom_reason,
            ri.created_at,
            i.item_name,
            i.item_code,
            i.item_unit,
            rr.reason_name
        FROM inventory_request_items ri
        JOIN inventory_items i ON ri.item_id = i.item_id
        LEFT JOIN inventory_request_reasons rr ON ri.reason_id = rr.reason_id
        WHERE ri.request_id = ?`,
    [requestId],
  );
  return rows;
}

function getRecordsDbPool(office) {
  switch ((office || '').toLowerCase()) {
    case 'luzon':
      console.log(office, 1);
      return db.luzon;
    case 'vismin':
      console.log(office, 2);
      return db.visminRec;
    case 'mlinc':
      console.log(office, 3);
      return db.default;
    case 'visminrecruitment':
      return db.visminReq;
    default:
      (console.log(office), 4);
      return db.default;
  }
}

// =============================================
// TRANSACTION OPERATIONS
// =============================================

async function logTransaction({
  itemId,
  type,
  quantity,
  referenceId,
  referenceType,
  remarks,
  userId,
}) {
  const dbPool = getRecordsDbPool('default');
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();

    // Get current stock
    const [stockRow] = await connection.query(
      `SELECT item_count FROM inventory_items WHERE item_id = ?`,
      [itemId],
    );
    const previousCount = stockRow[0]?.item_count || 0;

    // Calculate new count
    let newCount = previousCount;
    if (type === 'released') {
      newCount = previousCount - quantity;
    } else if (type === 'received') {
      newCount = previousCount + quantity;
    }

    // Update item stock
    await connection.query(
      `UPDATE inventory_items 
            SET item_count = ?, updated_at = NOW(), updated_by = ?
            WHERE item_id = ?`,
      [newCount, userId, itemId],
    );

    // Log transaction
    await connection.query(
      `INSERT INTO inventory_transactions (
                item_id,
                transaction_type,
                quantity,
                reference_id,
                reference_type,
                previous_count,
                new_count,
                remarks,
                created_by,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        itemId,
        type,
        quantity,
        referenceId,
        referenceType,
        previousCount,
        newCount,
        remarks || null,
        userId,
      ],
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// =============================================
// ADMIN/APPROVAL OPERATIONS
// =============================================

async function updateRequestStatus({ requestId, status, userId, remarks }) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Update status based on action
    let query = `UPDATE inventory_requests SET status = ?, updated_at = NOW(), updated_by = ?`;
    let params = [status, userId];

    if (status === 'approved') {
      query += `, approved_by = ?, approved_date = NOW()`;
      params.push(userId);
    } else if (status === 'released') {
      query += `, released_by = ?, released_date = NOW()`;
      params.push(userId);
    }

    query += ` WHERE request_id = ?`;
    params.push(requestId);

    await connection.query(query, params);

    // If releasing, update stock
    if (status === 'released') {
      const items = await getRequestItems(requestId);
      for (const item of items) {
        await logTransaction({
          itemId: item.item_id,
          type: 'released',
          quantity: item.quantity,
          referenceId: requestId,
          referenceType: 'request',
          remarks: `Released for request ${requestId}`,
          userId: userId,
        });
      }
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// =============================================
// ITEM CREATION OPERATIONS
// =============================================

async function createItem({
  itemCode,
  itemName,
  itemDescription,
  itemUnit,
  itemCount,
  itemOrderLevel,
  userId,
}) {
  const dbPool = getRecordsDbPool('default');
  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    // Check if item code already exists
    const [existing] = await connection.query(
      `SELECT item_id FROM inventory_items WHERE item_code = ?`,
      [itemCode],
    );

    if (existing.length > 0) {
      throw new Error('Item code already exists. Please use a unique code.');
    }

    // Check if item name already exists
    const [existingName] = await connection.query(
      `SELECT item_id FROM inventory_items WHERE item_name = ? AND is_active = 1`,
      [itemName],
    );

    if (existingName.length > 0) {
      throw new Error('Item name already exists. Please use a unique name.');
    }

    // Insert new item
    const [result] = await connection.query(
      `INSERT INTO inventory_items (
        item_code,
        item_name,
        item_description,
        item_unit,
        item_count,
        item_order_level,
        is_active,
        created_at,
        created_by,
        updated_at,
        updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), ?, NOW(), ?)`,
      [
        itemCode,
        itemName,
        itemDescription || null,
        itemUnit || 'pcs',
        itemCount || 0,
        itemOrderLevel || 10,
        userId,
        userId,
      ],
    );

    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateItem({
  itemId,
  itemCode,
  itemName,
  itemDescription,
  itemUnit,
  itemCount,
  itemOrderLevel,
  isActive,
  userId,
}) {
  const dbPool = getRecordsDbPool('default');
  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    // Check if item exists
    const [existing] = await connection.query(
      `SELECT item_id FROM inventory_items WHERE item_id = ?`,
      [itemId],
    );

    if (existing.length === 0) {
      throw new Error('Item not found');
    }

    // Check if item code is being changed and already exists
    if (itemCode) {
      const [codeCheck] = await connection.query(
        `SELECT item_id FROM inventory_items WHERE item_code = ? AND item_id != ?`,
        [itemCode, itemId],
      );
      if (codeCheck.length > 0) {
        throw new Error('Item code already exists. Please use a unique code.');
      }
    }

    // Check if item name is being changed and already exists
    if (itemName) {
      const [nameCheck] = await connection.query(
        `SELECT item_id FROM inventory_items WHERE item_name = ? AND item_id != ? AND is_active = 1`,
        [itemName, itemId],
      );
      if (nameCheck.length > 0) {
        throw new Error('Item name already exists. Please use a unique name.');
      }
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (itemCode) {
      updates.push('item_code = ?');
      params.push(itemCode);
    }
    if (itemName) {
      updates.push('item_name = ?');
      params.push(itemName);
    }
    if (itemDescription !== undefined) {
      updates.push('item_description = ?');
      params.push(itemDescription);
    }
    if (itemUnit) {
      updates.push('item_unit = ?');
      params.push(itemUnit);
    }
    if (itemCount !== undefined) {
      updates.push('item_count = ?');
      params.push(itemCount);
    }
    if (itemOrderLevel !== undefined) {
      updates.push('item_order_level = ?');
      params.push(itemOrderLevel);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive);
    }

    updates.push('updated_at = NOW()');
    updates.push('updated_by = ?');
    params.push(userId);
    params.push(itemId);

    await connection.query(
      `UPDATE inventory_items SET ${updates.join(', ')} WHERE item_id = ?`,
      params,
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getAllItems({ page = 1, limit = 20, search = '' }) {
  const offset = (page - 1) * limit;
  //let whereClause = 'WHERE is_active = 1';
  let whereClause = 'WHERE is_active in (1,0)';
  let params = [];

  if (search && search.trim()) {
    whereClause += ' AND (item_code LIKE ? OR item_name LIKE ? OR item_description LIKE ?)';
    const searchTerm = `%${search.trim()}%`;
    params = [searchTerm, searchTerm, searchTerm];
  }

  const [rows] = await db.default.query(
    `SELECT 
      item_id,
      item_code,
      item_name,
      item_description,
      item_unit,
      item_count AS stock,
      item_order_level,
      is_active,
      created_at,
      created_by,
      updated_at,
      updated_by
    FROM inventory_items
    ${whereClause}
    ORDER BY item_name ASC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [countResult] = await db.default.query(
    `SELECT COUNT(*) as total FROM inventory_items ${whereClause}`,
    params,
  );

  return {
    items: rows,
    total: countResult[0]?.total || 0,
    page,
    limit,
    totalPages: Math.ceil((countResult[0]?.total || 0) / limit),
  };
}

async function generateItemCode() {
  // Get the highest item_id from the table
  const [rows] = await db.default.query(`SELECT MAX(item_id) as max_id FROM inventory_items`);

  // Get the max item_id, default to 0 if no items exist
  const maxId = rows[0]?.max_id || 0;

  // Add 1 to get the next ID
  const nextId = maxId + 1;

  // Format as 4-digit with leading zeros
  const paddedId = String(nextId).padStart(4, '0');

  const currentYear = new Date().getFullYear();
  // Return the formatted code
  return `HR-${currentYear}-${paddedId}`;
}

async function generateUniqueItemCode(retries = 3) {
  for (let i = 0; i < retries; i++) {
    // Generate a new code based on current max item_id
    const code = await generateItemCode();

    // Check if code already exists in the database
    const [rows] = await db.default.query(
      `SELECT item_id FROM inventory_items WHERE item_code = ?`,
      [code],
    );

    if (rows.length === 0) {
      return code; // Code is unique, return it
    }

    // If we get here, there was a conflict (should be rare)
    console.warn(`Item code ${code} already exists, retrying... (attempt ${i + 1} of ${retries})`);
  }

  // If we exhaust all retries, throw an error
  throw new Error('Failed to generate unique item code after multiple attempts. Please try again.');
}

// =============================================
// STOCK ADJUSTMENT OPERATIONS
// =============================================

async function generateAdjustmentNumber() {
  const [rows] = await db.default.query(
    `SELECT COUNT(*) as count FROM inventory_adjustments 
     WHERE YEAR(created_at) = YEAR(NOW())`,
  );
  const count = (rows[0]?.count || 0) + 1;
  const year = new Date().getFullYear();
  return `ADJ-${year}-${String(count).padStart(6, '0')}`;
}

async function getAdjustmentReasons(type = null) {
  let query = `
    SELECT 
      reason_id,
      reason_code,
      reason_name,
      adjustment_type,
      display_order
    FROM inventory_adjustment_reasons
    WHERE is_active = 1
  `;

  const params = [];

  if (type && (type === 'add' || type === 'subtract')) {
    query += ` AND (adjustment_type = ? OR adjustment_type = 'both')`;
    params.push(type);
  }

  query += ` ORDER BY display_order ASC, reason_name ASC`;

  const [rows] = await db.default.query(query, params);
  return rows;
}

async function getAdjustmentReasonById(reasonId) {
  const [rows] = await db.default.query(
    `SELECT 
      reason_id,
      reason_code,
      reason_name,
      adjustment_type
    FROM inventory_adjustment_reasons
    WHERE reason_id = ? AND is_active = 1`,
    [reasonId],
  );
  return rows[0] || null;
}

async function createAdjustment({ itemId, quantity, reasonId, adjustmentType, remarks, userId }) {
  const dbPool = getRecordsDbPool('default');
  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    // Get current stock
    const [stockRow] = await connection.query(
      `SELECT item_count FROM inventory_items WHERE item_id = ?`,
      [itemId],
    );
    const previousCount = stockRow[0]?.item_count || 0;

    // Validate stock for subtraction
    if (adjustmentType === 'subtract' && quantity > previousCount) {
      throw new Error(`Insufficient stock. Available: ${previousCount}`);
    }

    // Calculate new count
    let newCount = previousCount;
    if (adjustmentType === 'add') {
      newCount = previousCount + quantity;
    } else if (adjustmentType === 'subtract') {
      newCount = previousCount - quantity;
    }

    // Generate adjustment number
    const adjustmentNumber = await generateAdjustmentNumber();

    // Insert adjustment record
    const [result] = await connection.query(
      `INSERT INTO inventory_adjustments (
        adjustment_number,
        item_id,
        quantity,
        reason_id,
        adjustment_type,
        previous_count,
        new_count,
        remarks,
        status,
        created_by,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())`,
      [
        adjustmentNumber,
        itemId,
        quantity,
        reasonId,
        adjustmentType,
        previousCount,
        newCount,
        remarks || null,
        userId,
      ],
    );

    const adjustmentId = result.insertId;

    await connection.commit();
    return {
      adjustmentId,
      adjustmentNumber,
      previousCount,
      newCount,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function approveAdjustment({ adjustmentId, userId }) {
  const dbPool = getRecordsDbPool('default');
  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    // Get adjustment details
    const [adjustment] = await connection.query(
      `SELECT 
        item_id,
        quantity,
        adjustment_type,
        previous_count,
        new_count,
        status
      FROM inventory_adjustments
      WHERE adjustment_id = ?`,
      [adjustmentId],
    );

    if (!adjustment || adjustment.length === 0) {
      throw new Error('Adjustment not found');
    }

    if (adjustment[0].status !== 'pending') {
      throw new Error(`Adjustment is already ${adjustment[0].status}`);
    }

    // Update adjustment status
    await connection.query(
      `UPDATE inventory_adjustments 
       SET status = 'approved', 
           approved_by = ?, 
           approved_at = NOW() 
       WHERE adjustment_id = ?`,
      [userId, adjustmentId],
    );

    // Update item stock
    await connection.query(
      `UPDATE inventory_items 
       SET item_count = ?, 
           updated_at = NOW(), 
           updated_by = ? 
       WHERE item_id = ?`,
      [adjustment[0].new_count, userId, adjustment[0].item_id],
    );

    // Log transaction
    await connection.query(
      `INSERT INTO inventory_transactions (
        item_id,
        transaction_type,
        quantity,
        reference_id,
        reference_type,
        previous_count,
        new_count,
        remarks,
        created_by,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        adjustment[0].item_id,
        adjustment[0].adjustment_type === 'add' ? 'received' : 'released',
        adjustment[0].quantity,
        adjustmentId,
        'adjustment',
        adjustment[0].previous_count,
        adjustment[0].new_count,
        `Stock adjustment (${adjustment[0].adjustment_type}) - Adjustment #${adjustmentId}`,
        userId,
      ],
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function rejectAdjustment({ adjustmentId, userId, rejectionReason }) {
  const connection = await db.default.getConnection();

  try {
    await connection.beginTransaction();

    // Check if adjustment exists and is pending
    const [adjustment] = await connection.query(
      `SELECT status FROM inventory_adjustments WHERE adjustment_id = ?`,
      [adjustmentId],
    );

    if (!adjustment || adjustment.length === 0) {
      throw new Error('Adjustment not found');
    }

    if (adjustment[0].status !== 'pending') {
      throw new Error(`Adjustment is already ${adjustment[0].status}`);
    }

    // Update adjustment status
    await connection.query(
      `UPDATE inventory_adjustments 
       SET status = 'rejected', 
           rejected_by = ?, 
           rejected_at = NOW(),
           rejection_reason = ?
       WHERE adjustment_id = ?`,
      [userId, rejectionReason || null, adjustmentId],
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getAdjustments({
  page = 1,
  limit = 20,
  status = null,
  startDate = null,
  endDate = null,
  search = '',
}) {
  const offset = (page - 1) * limit;
  let conditions = [];
  let params = [];

  if (status) {
    conditions.push('a.status = ?');
    params.push(status);
  }

  if (startDate) {
    conditions.push('DATE(a.created_at) >= ?');
    params.push(startDate);
  }

  if (endDate) {
    conditions.push('DATE(a.created_at) <= ?');
    params.push(endDate);
  }

  if (search && search.trim()) {
    conditions.push('(i.item_name LIKE ? OR i.item_code LIKE ? OR a.adjustment_number LIKE ?)');
    const searchTerm = `%${search.trim()}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  let whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await db.default.query(
    `SELECT 
      a.adjustment_id,
      a.adjustment_number,
      a.item_id,
      a.quantity,
      a.adjustment_type,
      a.previous_count,
      a.new_count,
      a.remarks,
      a.status,
      a.created_at,
      a.created_by,
      a.approved_by,
      a.approved_at,
      a.rejected_by,
      a.rejected_at,
      a.rejection_reason,
      i.item_name,
      i.item_code,
      i.item_unit,
      r.reason_name,
      r.reason_code,
      creator.user_name as created_by_name,
      creator.idno as created_by_idno,
      approver.user_name as approved_by_name,
      approver.idno as approved_by_idno,
      rejector.user_name as rejected_by_name,
      rejector.idno as rejected_by_idno
    FROM inventory_adjustments a
    JOIN inventory_items i ON a.item_id = i.item_id
    JOIN inventory_adjustment_reasons r ON a.reason_id = r.reason_id
    LEFT JOIN main_users creator ON a.created_by = creator.user_id
    LEFT JOIN main_users approver ON a.approved_by = approver.user_id
    LEFT JOIN main_users rejector ON a.rejected_by = rejector.user_id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [countResult] = await db.default.query(
    `SELECT COUNT(*) as total FROM inventory_adjustments a
     JOIN inventory_items i ON a.item_id = i.item_id
     ${whereClause}`,
    params,
  );

  return {
    adjustments: rows,
    total: countResult[0]?.total || 0,
    page,
    limit,
    totalPages: Math.ceil((countResult[0]?.total || 0) / limit),
  };
}

async function getAdjustmentById(adjustmentId) {
  const [rows] = await db.default.query(
    `SELECT 
      a.adjustment_id,
      a.adjustment_number,
      a.item_id,
      a.quantity,
      a.adjustment_type,
      a.previous_count,
      a.new_count,
      a.remarks,
      a.status,
      a.created_at,
      a.created_by,
      a.approved_by,
      a.approved_at,
      a.rejected_by,
      a.rejected_at,
      a.rejection_reason,
      i.item_name,
      i.item_code,
      i.item_unit,
      i.item_count as current_stock,
      r.reason_name,
      r.reason_code,
      creator.user_name as created_by_name,
      creator.idno as created_by_idno,
      approver.user_name as approved_by_name,
      approver.idno as approved_by_idno,
      rejector.user_name as rejected_by_name,
      rejector.idno as rejected_by_idno
    FROM inventory_adjustments a
    JOIN inventory_items i ON a.item_id = i.item_id
    JOIN inventory_adjustment_reasons r ON a.reason_id = r.reason_id
    LEFT JOIN main_users creator ON a.created_by = creator.user_id
    LEFT JOIN main_users approver ON a.approved_by = approver.user_id
    LEFT JOIN main_users rejector ON a.rejected_by = rejector.user_id
    WHERE a.adjustment_id = ?`,
    [adjustmentId],
  );
  return rows[0] || null;
}

// =============================================
// USER HELPER FUNCTIONS FOR main_users
// =============================================

async function getUserById(userId) {
  if (!userId) return null;
  const [rows] = await db.default.query(
    `SELECT 
      user_id, 
      idno, 
      user_name, 
      first_name, 
      last_name, 
      designation, 
      user_email, 
      role_id, 
      is_active 
    FROM main_users 
    WHERE user_id = ?`,
    [userId],
  );
  return rows[0] || null;
}

async function getFullName(userId) {
  if (!userId) return 'Unknown';
  const [rows] = await db.default.query(
    `SELECT first_name, last_name, user_name, idno 
     FROM main_users 
     WHERE user_id = ?`,
    [userId],
  );
  if (rows.length === 0) return 'Unknown';
  const user = rows[0];
  if (user.first_name && user.last_name) {
    return `${user.first_name} ${user.last_name}`;
  }
  return user.user_name || user.idno || 'Unknown';
}

async function getUsersForDropdown(search = '') {
  let query = `
    SELECT 
      user_id, 
      user_name, 
      idno, 
      first_name, 
      last_name, 
      designation 
    FROM main_users 
    WHERE is_active = 1
  `;
  let params = [];

  if (search && search.trim()) {
    query += ` AND (user_name LIKE ? OR idno LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR designation LIKE ?)`;
    const searchTerm = `%${search.trim()}%`;
    params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];
  }

  query += ` ORDER BY first_name ASC, last_name ASC LIMIT 20`;

  const [rows] = await db.default.query(query, params);
  return rows;
}

async function getAdjustmentStats() {
  const [rows] = await db.default.query(
    `SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN adjustment_type = 'add' AND status = 'approved' THEN quantity ELSE 0 END) as total_added,
      SUM(CASE WHEN adjustment_type = 'subtract' AND status = 'approved' THEN quantity ELSE 0 END) as total_subtracted
    FROM inventory_adjustments`,
  );
  return (
    rows[0] || {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      total_added: 0,
      total_subtracted: 0,
    }
  );
}

// =============================================
// REQUEST APPROVAL OPERATIONS
// =============================================

async function getPendingRequests({
  page = 1,
  limit = 20,
  search = '',
  startDate = null,
  endDate = null,
}) {
  const offset = (page - 1) * limit;
  let conditions = ['ir.status = "pending"'];
  let params = [];

  if (search && search.trim()) {
    conditions.push('(ir.request_number LIKE ? OR i.item_name LIKE ? OR i.item_code LIKE ?)');
    const searchTerm = `%${search.trim()}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (startDate) {
    conditions.push('DATE(ir.created_at) >= ?');
    params.push(startDate);
  }

  if (endDate) {
    conditions.push('DATE(ir.created_at) <= ?');
    params.push(endDate);
  }

  let whereClause = `WHERE ${conditions.join(' AND ')}`;

  // MAIN QUERY with all joins
  const [rows] = await db.default.query(
    `SELECT 
      ir.request_id,
      ir.request_number,
      ir.user_id,
      ir.request_date,
      ir.status,
      ir.total_items,
      ir.remarks,
      ir.created_at,
      ir.created_by,
      u.idno,
      u.first_name,
      u.last_name,
      u.designation,
      u.user_name,
      GROUP_CONCAT(
        CONCAT(i.item_name, ' (', ri.quantity, ' ', i.item_unit, ')')
        SEPARATOR ', '
      ) as items_summary,
      COUNT(ri.request_item_id) as item_count
    FROM inventory_requests ir
    JOIN main_users u ON ir.user_id = u.user_id
    LEFT JOIN inventory_request_items ri ON ir.request_id = ri.request_id
    LEFT JOIN inventory_items i ON ri.item_id = i.item_id
    ${whereClause}
    GROUP BY ir.request_id, u.idno, u.first_name, u.last_name, u.designation, u.user_name
    ORDER BY ir.created_at ASC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  // COUNT QUERY - MUST include the same joins because of the WHERE clause
  const [countResult] = await db.default.query(
    `SELECT COUNT(DISTINCT ir.request_id) as total 
     FROM inventory_requests ir
     JOIN main_users u ON ir.user_id = u.user_id
     LEFT JOIN inventory_request_items ri ON ir.request_id = ri.request_id
     LEFT JOIN inventory_items i ON ri.item_id = i.item_id
     ${whereClause}`,
    params,
  );

  return {
    requests: rows,
    total: countResult[0]?.total || 0,
    page,
    limit,
    totalPages: Math.ceil((countResult[0]?.total || 0) / limit),
  };
}

async function getRequestForApproval(requestId) {
  const [rows] = await db.default.query(
    `SELECT 
      ir.request_id,
      ir.request_number,
      ir.user_id,
      ir.request_date,
      ir.status,
      ir.total_items,
      ir.remarks,
      ir.created_at,
      ir.created_by,
      ir.approved_by,
      ir.approved_date,
      ir.rejected_by,
      ir.rejected_date,
      ir.rejection_reason,
      u.idno,
      u.first_name,
      u.last_name,
      u.designation,
      u.user_name
    FROM inventory_requests ir
    JOIN main_users u ON ir.user_id = u.user_id
    WHERE ir.request_id = ?`,
    [requestId],
  );
  return rows[0] || null;
}

async function getRequestItemsWithStock(requestId) {
  const [rows] = await db.default.query(
    `SELECT 
      ri.request_item_id,
      ri.request_id,
      ri.item_id,
      ri.quantity as requested_quantity,
      ri.reason_id,
      ri.custom_reason,
      ri.created_at,
      i.item_name,
      i.item_code,
      i.item_unit,
      i.item_count as current_stock,
      i.item_order_level,
      rr.reason_name,
      ri.quantity as quantity
    FROM inventory_request_items ri
    JOIN inventory_items i ON ri.item_id = i.item_id
    LEFT JOIN inventory_request_reasons rr ON ri.reason_id = rr.reason_id
    WHERE ri.request_id = ?`,
    [requestId],
  );
  return rows;
}

async function approveRequest({ requestId, userId, remarks = null }) {
  const dbPool = getRecordsDbPool('default');
  const connection = await dbPool.getConnection();

  try {
    await connection.beginTransaction();

    // Get request details
    const [request] = await connection.query(
      `SELECT status, user_id FROM inventory_requests WHERE request_id = ?`,
      [requestId],
    );

    if (!request || request.length === 0) {
      throw new Error('Request not found');
    }

    if (request[0].status !== 'pending') {
      throw new Error(`Request is already ${request[0].status}`);
    }

    // Get request items
    const items = await getRequestItemsWithStock(requestId);

    // Check stock availability for all items
    for (const item of items) {
      if (item.current_stock < item.requested_quantity) {
        throw new Error(
          `Insufficient stock for "${item.item_name}". Available: ${item.current_stock} ${item.item_unit}`,
        );
      }
    }

    // Update request status
    await connection.query(
      `UPDATE inventory_requests 
       SET status = 'approved', 
           approved_by = ?, 
           approved_date = NOW(),
           remarks = COALESCE(?, remarks)
       WHERE request_id = ?`,
      [userId, remarks, requestId],
    );

    // Deduct stock for each item and log transactions
    for (const item of items) {
      // Update item stock
      const newStock = item.current_stock - item.requested_quantity;
      await connection.query(
        `UPDATE inventory_items 
         SET item_count = ?, 
             updated_at = NOW(), 
             updated_by = ? 
         WHERE item_id = ?`,
        [newStock, userId, item.item_id],
      );

      // Log transaction
      await connection.query(
        `INSERT INTO inventory_transactions (
          item_id,
          transaction_type,
          quantity,
          reference_id,
          reference_type,
          previous_count,
          new_count,
          remarks,
          created_by,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          item.item_id,
          'released',
          item.requested_quantity,
          requestId,
          'request',
          item.current_stock,
          newStock,
          `Approved request #${requestId} - ${item.item_name}`,
          userId,
        ],
      );
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function rejectRequest({ requestId, userId, rejectionReason }) {
  const connection = await db.default.getConnection();

  try {
    await connection.beginTransaction();

    // Get request details
    const [request] = await connection.query(
      `SELECT status FROM inventory_requests WHERE request_id = ?`,
      [requestId],
    );

    if (!request || request.length === 0) {
      throw new Error('Request not found');
    }

    if (request[0].status !== 'pending') {
      throw new Error(`Request is already ${request[0].status}`);
    }

    // Update request status
    await connection.query(
      `UPDATE inventory_requests 
       SET status = 'rejected', 
           rejected_by = ?, 
           rejected_date = NOW(),
           rejection_reason = ?
       WHERE request_id = ?`,
      [userId, rejectionReason, requestId],
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
async function getRequestStats() {
  const [rows] = await db.default.query(
    `SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN status = 'pending' THEN total_items ELSE 0 END) as pending_items
    FROM inventory_requests`,
  );
  return (
    rows[0] || { total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0, pending_items: 0 }
  );
}

// async function getUserRequests({ userId, page = 1, limit = 20, status = null }) {
//   const offset = (page - 1) * limit;
//   let conditions = ['ir.user_id = ?'];
//   let params = [userId];

//   if (status) {
//     conditions.push('ir.status = ?');
//     params.push(status);
//   }

//   let whereClause = `WHERE ${conditions.join(' AND ')}`;

//   const [rows] = await db.default.query(
//     `SELECT
//       ir.request_id,
//       ir.request_number,
//       ir.request_date,
//       ir.status,
//       ir.total_items,
//       ir.remarks,
//       ir.created_at,
//       ir.approved_by,
//       ir.approved_date,
//       ir.rejected_by,
//       ir.rejected_date,
//       ir.rejection_reason,
//       approver.user_name as approved_by_name,
//       rejector.user_name as rejected_by_name
//     FROM inventory_requests ir
//     LEFT JOIN main_users approver ON ir.approved_by = approver.user_id
//     LEFT JOIN main_users rejector ON ir.rejected_by = rejector.user_id
//     ${whereClause}
//     ORDER BY ir.created_at DESC
//     LIMIT ? OFFSET ?`,
//     [...params, limit, offset],
//   );

//   const [countResult] = await db.default.query(
//     `SELECT COUNT(*) as total FROM inventory_requests ir ${whereClause}`,
//     params,
//   );

//   return {
//     requests: rows,
//     total: countResult[0]?.total || 0,
//     page,
//     limit,
//     totalPages: Math.ceil((countResult[0]?.total || 0) / limit),
//   };
// }

// =============================================
// USER REQUESTS - For viewing personal requests
// =============================================

async function getUserRequests({ userId, page = 1, limit = 20, status = null, search = '' }) {
  const offset = (page - 1) * limit;
  let conditions = ['ir.user_id = ?'];
  let params = [userId];

  if (status) {
    conditions.push('ir.status = ?');
    params.push(status);
  }

  if (search && search.trim()) {
    conditions.push('(ir.request_number LIKE ? OR i.item_name LIKE ?)');
    const searchTerm = `%${search.trim()}%`;
    params.push(searchTerm, searchTerm);
  }

  let whereClause = `WHERE ${conditions.join(' AND ')}`;

  const [rows] = await db.default.query(
    `SELECT 
      ir.request_id,
      ir.request_number,
      ir.request_date,
      ir.status,
      ir.total_items,
      ir.remarks,
      ir.created_at,
      ir.approved_by,
      ir.approved_date,
      ir.rejected_by,
      ir.rejected_date,
      ir.rejection_reason,
      approver.user_name as approved_by_name,
      approver.first_name as approved_by_first,
      approver.last_name as approved_by_last,
      rejector.user_name as rejected_by_name,
      rejector.first_name as rejected_by_first,
      rejector.last_name as rejected_by_last,
      GROUP_CONCAT(
        CONCAT(i.item_name, ' (', ri.quantity, ' ', i.item_unit, ')')
        SEPARATOR ', '
      ) as items_summary
    FROM inventory_requests ir
    LEFT JOIN inventory_request_items ri ON ir.request_id = ri.request_id
    LEFT JOIN inventory_items i ON ri.item_id = i.item_id
    LEFT JOIN main_users approver ON ir.approved_by = approver.user_id
    LEFT JOIN main_users rejector ON ir.rejected_by = rejector.user_id
    ${whereClause}
    GROUP BY ir.request_id, 
             approver.user_name, approver.first_name, approver.last_name,
             rejector.user_name, rejector.first_name, rejector.last_name
    ORDER BY ir.created_at DESC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [countResult] = await db.default.query(
    `SELECT COUNT(DISTINCT ir.request_id) as total 
     FROM inventory_requests ir
     LEFT JOIN inventory_request_items ri ON ir.request_id = ri.request_id
     LEFT JOIN inventory_items i ON ri.item_id = i.item_id
     ${whereClause}`,
    params,
  );

  return {
    requests: rows,
    total: countResult[0]?.total || 0,
    page,
    limit,
    totalPages: Math.ceil((countResult[0]?.total || 0) / limit),
  };
}

async function getUserRequestStats(userId) {
  const [rows] = await db.default.query(
    `SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
    FROM inventory_requests
    WHERE user_id = ?`,
    [userId],
  );
  return rows[0] || { total: 0, pending: 0, approved: 0, rejected: 0 };
}

async function cancelRequest({ requestId, userId }) {
  const connection = await db.default.getConnection();

  try {
    await connection.beginTransaction();

    // Check if request exists and is pending
    const [request] = await connection.query(
      `SELECT status FROM inventory_requests WHERE request_id = ? AND user_id = ?`,
      [requestId, userId],
    );

    if (!request || request.length === 0) {
      throw new Error('Request not found');
    }

    if (request[0].status !== 'pending') {
      throw new Error(`Cannot cancel a request that is already ${request[0].status}`);
    }

    // Update request status
    await connection.query(
      `UPDATE inventory_requests 
       SET status = 'cancelled', 
           updated_at = NOW(), 
           updated_by = ? 
       WHERE request_id = ?`,
      [userId, requestId],
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// =============================================
// INVENTORY REPORTS
// =============================================

async function getRequestSummaryReport({
  startDate = null,
  endDate = null,
  status = null,
  userId = null,
}) {
  let conditions = [];
  let params = [];

  if (startDate) {
    conditions.push('DATE(ir.created_at) >= ?');
    params.push(startDate);
  }

  if (endDate) {
    conditions.push('DATE(ir.created_at) <= ?');
    params.push(endDate);
  }

  if (status) {
    conditions.push('ir.status = ?');
    params.push(status);
  }

  if (userId) {
    conditions.push('ir.user_id = ?');
    params.push(userId);
  }

  let whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Summary by status
  const [statusSummary] = await db.default.query(
    `SELECT 
      ir.status,
      COUNT(*) as count,
      SUM(ir.total_items) as total_items
    FROM inventory_requests ir
    ${whereClause}
    GROUP BY ir.status`,
    params,
  );

  // Top requested items
  const [topItems] = await db.default.query(
    `SELECT 
      i.item_id,
      i.item_name,
      i.item_code,
      i.item_unit,
      SUM(ri.quantity) as total_requested,
      COUNT(DISTINCT ir.request_id) as request_count,
      AVG(ri.quantity) as avg_quantity
    FROM inventory_request_items ri
    JOIN inventory_items i ON ri.item_id = i.item_id
    JOIN inventory_requests ir ON ri.request_id = ir.request_id
    ${whereClause}
    GROUP BY i.item_id, i.item_name, i.item_code, i.item_unit
    ORDER BY total_requested DESC
    LIMIT 20`,
    params,
  );

  // Requesters summary
  const [requesterSummary] = await db.default.query(
    `SELECT 
      u.user_id,
      u.idno,
      u.first_name,
      u.last_name,
      u.designation,
      COUNT(ir.request_id) as request_count,
      SUM(ir.total_items) as total_items
    FROM inventory_requests ir
    JOIN main_users u ON ir.user_id = u.user_id
    ${whereClause}
    GROUP BY u.user_id, u.idno, u.first_name, u.last_name, u.designation
    ORDER BY request_count DESC
    LIMIT 20`,
    params,
  );

  // Daily request trend
  const [dailyTrend] = await db.default.query(
    `SELECT 
      DATE(ir.created_at) as date,
      COUNT(*) as request_count,
      SUM(ir.total_items) as items_count
    FROM inventory_requests ir
    ${whereClause}
    GROUP BY DATE(ir.created_at)
    ORDER BY date DESC
    LIMIT 30`,
    params,
  );

  return {
    statusSummary,
    topItems,
    requesterSummary,
    dailyTrend,
    totalRequests: statusSummary.reduce((sum, s) => sum + s.count, 0),
    totalItems: statusSummary.reduce((sum, s) => sum + s.total_items, 0),
  };
}

async function getInventoryMovementReport({
  startDate = null,
  endDate = null,
  itemId = null,
  transactionType = null,
}) {
  let conditions = [];
  let params = [];

  if (startDate) {
    conditions.push('DATE(it.created_at) >= ?');
    params.push(startDate);
  }

  if (endDate) {
    conditions.push('DATE(it.created_at) <= ?');
    params.push(endDate);
  }

  if (itemId) {
    conditions.push('it.item_id = ?');
    params.push(itemId);
  }

  if (transactionType) {
    conditions.push('it.transaction_type = ?');
    params.push(transactionType);
  }

  let whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [transactions] = await db.default.query(
    `SELECT 
      it.transaction_id,
      it.transaction_type,
      it.quantity,
      it.previous_count,
      it.new_count,
      it.reference_type,
      it.reference_id,
      it.remarks,
      it.created_at,
      i.item_id,
      i.item_name,
      i.item_code,
      i.item_unit,
      u.user_name as created_by_name,
      u.first_name,
      u.last_name
    FROM inventory_transactions it
    JOIN inventory_items i ON it.item_id = i.item_id
    LEFT JOIN main_users u ON it.created_by = u.user_id
    ${whereClause}
    ORDER BY it.created_at DESC
    LIMIT 500`,
    params,
  );

  // Summary totals
  const [summary] = await db.default.query(
    `SELECT 
      SUM(CASE WHEN transaction_type = 'received' THEN quantity ELSE 0 END) as total_received,
      SUM(CASE WHEN transaction_type = 'released' THEN quantity ELSE 0 END) as total_released,
      COUNT(CASE WHEN transaction_type = 'received' THEN 1 END) as received_count,
      COUNT(CASE WHEN transaction_type = 'released' THEN 1 END) as released_count
    FROM inventory_transactions it
    ${whereClause}`,
    params,
  );

  return {
    transactions,
    summary: summary[0] || {
      total_received: 0,
      total_released: 0,
      received_count: 0,
      released_count: 0,
    },
  };
}

async function getStockStatusReport({
  category = null,
  minStock = null,
  maxStock = null,
  showInactive = false,
}) {
  let conditions = ['i.is_active = ?'];
  let params = [showInactive ? 0 : 1];

  if (category) {
    conditions.push('i.item_category = ?');
    params.push(category);
  }

  if (minStock !== null) {
    conditions.push('i.item_count < ?');
    params.push(minStock);
  }

  if (maxStock !== null) {
    conditions.push('i.item_count > ?');
    params.push(maxStock);
  }

  let whereClause = `WHERE ${conditions.join(' AND ')}`;

  const [items] = await db.default.query(
    `SELECT 
      i.item_id,
      i.item_code,
      i.item_name,
      i.item_description,
      i.item_unit,
      i.item_count as stock,
      i.item_order_level,
      i.is_active,
      i.created_at,
      i.updated_at,
      CASE 
        WHEN i.item_count <= i.item_order_level THEN 'Low Stock'
        WHEN i.item_count = 0 THEN 'Out of Stock'
        WHEN i.item_count <= i.item_order_level * 2 THEN 'Moderate'
        ELSE 'Good'
      END as stock_status
    FROM inventory_items i
    ${whereClause}
    ORDER BY 
      CASE 
        WHEN i.item_count <= i.item_order_level THEN 0
        WHEN i.item_count = 0 THEN 1
        ELSE 2
      END,
      i.item_count ASC`,
    params,
  );

  const [summary] = await db.default.query(
    `SELECT 
      COUNT(*) as total_items,
      SUM(CASE WHEN item_count <= item_order_level THEN 1 ELSE 0 END) as low_stock,
      SUM(CASE WHEN item_count = 0 THEN 1 ELSE 0 END) as out_of_stock,
      SUM(item_count) as total_units,
      AVG(item_count) as avg_stock
    FROM inventory_items i
    ${whereClause}`,
    params,
  );

  return {
    items,
    summary: summary[0] || {
      total_items: 0,
      low_stock: 0,
      out_of_stock: 0,
      total_units: 0,
      avg_stock: 0,
    },
  };
}

async function getUserActivityReport({ startDate = null, endDate = null, userId = null }) {
  let conditions = [];
  let params = [];

  if (startDate) {
    conditions.push('DATE(ir.created_at) >= ?');
    params.push(startDate);
  }

  if (endDate) {
    conditions.push('DATE(ir.created_at) <= ?');
    params.push(endDate);
  }

  if (userId) {
    conditions.push('ir.user_id = ?');
    params.push(userId);
  }

  let whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [users] = await db.default.query(
    `SELECT 
      u.user_id,
      u.idno,
      u.first_name,
      u.last_name,
      u.designation,
      COUNT(ir.request_id) as total_requests,
      SUM(CASE WHEN ir.status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN ir.status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN ir.status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN ir.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
      SUM(ir.total_items) as total_items,
      AVG(ir.total_items) as avg_items_per_request,
      MAX(ir.created_at) as last_request_date
    FROM main_users u
    LEFT JOIN inventory_requests ir ON u.user_id = ir.user_id
    ${whereClause}
    GROUP BY u.user_id, u.idno, u.first_name, u.last_name, u.designation
    HAVING total_requests > 0
    ORDER BY total_requests DESC
    LIMIT 50`,
    params,
  );

  return users;
}

async function getDashboardMetrics() {
  // Get total counts
  const [counts] = await db.default.query(
    `SELECT 
      (SELECT COUNT(*) FROM inventory_items WHERE is_active = 1) as total_items,
      (SELECT COUNT(*) FROM inventory_requests WHERE status = 'pending') as pending_requests,
      (SELECT COUNT(*) FROM inventory_requests WHERE status = 'approved' AND DATE(created_at) = CURDATE()) as today_approved,
      (SELECT COUNT(*) FROM inventory_items WHERE item_count <= item_order_level AND is_active = 1) as low_stock_items,
      (SELECT COUNT(*) FROM inventory_items WHERE item_count = 0 AND is_active = 1) as out_of_stock_items,
      (SELECT COUNT(*) FROM inventory_requests WHERE DATE(created_at) = CURDATE()) as today_requests,
      (SELECT COUNT(*) FROM inventory_requests) as total_requests,
      (SELECT COUNT(DISTINCT user_id) FROM inventory_requests) as total_users
    FROM DUAL`,
  );

  // Recent activity
  const [recentActivity] = await db.default.query(
    `SELECT 
      'request' as type,
      ir.request_number as reference,
      ir.status,
      ir.created_at,
      u.first_name,
      u.last_name,
      u.idno
    FROM inventory_requests ir
    JOIN main_users u ON ir.user_id = u.user_id
    ORDER BY ir.created_at DESC
    LIMIT 10`,
  );

  // Top requested items
  const [topItems] = await db.default.query(
    `SELECT 
      i.item_name,
      i.item_code,
      SUM(ri.quantity) as total_requested
    FROM inventory_request_items ri
    JOIN inventory_items i ON ri.item_id = i.item_id
    JOIN inventory_requests ir ON ri.request_id = ir.request_id
    WHERE ir.status = 'approved'
    GROUP BY i.item_id, i.item_name, i.item_code
    ORDER BY total_requested DESC
    LIMIT 10`,
  );

  // Monthly trend
  const [monthlyTrend] = await db.default.query(
    `SELECT 
      DATE_FORMAT(created_at, '%Y-%m') as month,
      COUNT(*) as requests,
      SUM(total_items) as items
    FROM inventory_requests
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY month DESC`,
  );

  return {
    counts: counts[0] || {},
    recentActivity,
    topItems,
    monthlyTrend,
  };
}

module.exports = {
  searchItems,
  getItemById,
  getItemStock,
  getRequestReasons,
  getReasonById,
  createRequest,
  getRequestById,
  getRequestItems,
  logTransaction,
  updateRequestStatus,
  createItem,
  updateItem,
  getAllItems,
  generateItemCode,
  generateUniqueItemCode,
  generateAdjustmentNumber,
  getAdjustmentReasons,
  getAdjustmentReasonById,
  createAdjustment,
  approveAdjustment,
  rejectAdjustment,
  getAdjustments,
  getAdjustmentById,
  getAdjustmentStats,

  getUserById,
  getFullName,
  getUsersForDropdown,
  getPendingRequests,
  approveRequest,
  rejectRequest,
  getUserRequests,
  getRequestStats,
  getRequestForApproval,
  getRequestItemsWithStock,
  getUserRequestStats,
  getDashboardMetrics,
  getStockStatusReport,
  getUserActivityReport,
  getInventoryMovementReport,
  getRequestSummaryReport,
};
