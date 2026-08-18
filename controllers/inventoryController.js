const inventoryModel = require('../models/inventoryModel');

// =============================================
// REQUEST PAGE
// =============================================

async function getRequestPage(req, res) {
  try {
    const reasons = await inventoryModel.getRequestReasons();

    res.render('inventory/request', {
      title: 'Item Request',
      reasons,
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading request page:', error);
    res.status(500).render('error', {
      error: 'Failed to load request page.',
    });
  }
}

// =============================================
// API ENDPOINTS
// =============================================

async function searchItems(req, res) {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ items: [] });
    }

    const items = await inventoryModel.searchItems(q.trim());
    return res.json({ items });
  } catch (error) {
    console.error('Error searching items:', error);
    return res.status(500).json({
      error: 'Failed to search items',
      items: [],
    });
  }
}

async function getItemDetails(req, res) {
  try {
    const { id } = req.params;
    const item = await inventoryModel.getItemById(id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    return res.json({ item });
  } catch (error) {
    console.error('Error getting item details:', error);
    return res.status(500).json({
      error: 'Failed to get item details',
    });
  }
}

async function getRequestReasons(req, res) {
  try {
    const reasons = await inventoryModel.getRequestReasons();
    return res.json({ reasons });
  } catch (error) {
    console.error('Error fetching reasons:', error);
    return res.status(500).json({
      error: 'Failed to fetch reasons',
    });
  }
}

async function saveRequest(req, res) {
  try {
    const { items, remarks } = req.body;
    const userId = req.session.user?.id;

    // Validate user
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated.',
      });
    }

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please add at least one item to request.',
      });
    }

    // Check stock availability and prepare items with item names for error messages
    for (const item of items) {
      const stock = await inventoryModel.getItemStock(item.item_id);
      const itemDetails = await inventoryModel.getItemById(item.item_id);

      if (stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${itemDetails?.item_name || 'Item'}". Available: ${stock} ${itemDetails?.item_unit || 'pcs'}`,
        });
      }

      // Attach item name for later use
      item.item_name = itemDetails?.item_name;
      item.item_unit = itemDetails?.item_unit;
    }

    // Create request
    const requestId = await inventoryModel.createRequest({
      userId,
      items,
      remarks,
    });

    // Get request details for response
    const request = await inventoryModel.getRequestById(requestId);

    // After successful save
    return res.json({
      success: true,
      message: 'Request submitted successfully!',
      requestId,
      requestNumber: request?.request_number || `REQ-${String(requestId).padStart(6, '0')}`,
      redirect: '/inventory/my-requests', // ← Add this
    });
  } catch (error) {
    console.error('Error saving request:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save request. Please try again.',
    });
  }
}

// =============================================
// ITEM ENTRY/CREATION
// =============================================

async function getItemEntryPage(req, res) {
  try {
    // Generate a unique item code for new items
    const itemCode = await inventoryModel.generateUniqueItemCode();

    res.render('inventory/item-entry', {
      title: 'Item Entry',
      itemCode, // ← This is for new items
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading item entry page:', error);
    res.status(500).render('error', {
      error: 'Failed to load item entry page. Please try again.',
    });
  }
}

async function getItemListPage(req, res) {
  try {
    const { page = 1, search = '' } = req.query;
    const result = await inventoryModel.getAllItems({
      page: parseInt(page),
      limit: 20,
      search,
    });

    res.render('inventory/item-list', {
      title: 'Inventory Items',
      items: result.items,
      pagination: {
        currentPage: result.page,
        totalPages: result.totalPages,
        totalItems: result.total,
        limit: result.limit,
      },
      search,
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading item list:', error);
    res.status(500).render('error', {
      error: 'Failed to load item list.',
    });
  }
}

async function getItemEditPage(req, res) {
  try {
    const { id } = req.params;
    const item = await inventoryModel.getItemById(id);

    if (!item) {
      return res.status(404).render('error', {
        error: 'Item not found',
      });
    }

    // Pass the item code as itemCode for the view
    res.render('inventory/item-entry', {
      title: 'Edit Item',
      item,
      itemCode: item.item_code, // ← Add this line
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading item edit page:', error);
    res.status(500).render('error', {
      error: 'Failed to load item edit page.',
    });
  }
}

async function saveItem(req, res) {
  try {
    const {
      item_id,
      item_code,
      item_name,
      item_description,
      item_unit,
      item_count,
      item_order_level,
      is_active,
    } = req.body;

    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated.',
      });
    }

    // Validate required fields
    if (!item_code || !item_name) {
      return res.status(400).json({
        success: false,
        message: 'Item code and name are required.',
      });
    }

    let result;
    if (item_id) {
      // Update existing item
      result = await inventoryModel.updateItem({
        itemId: item_id,
        itemCode: item_code,
        itemName: item_name,
        itemDescription: item_description,
        itemUnit: item_unit,
        itemCount: item_count ? parseInt(item_count) : 0,
        itemOrderLevel: item_order_level ? parseInt(item_order_level) : 10,
        isActive: is_active !== undefined ? parseInt(is_active) : 1,
        userId,
      });
    } else {
      // Create new item
      result = await inventoryModel.createItem({
        itemCode: item_code,
        itemName: item_name,
        itemDescription: item_description,
        itemUnit: item_unit || 'pcs',
        itemCount: item_count ? parseInt(item_count) : 0,
        itemOrderLevel: item_order_level ? parseInt(item_order_level) : 10,
        userId,
      });
    }

    return res.json({
      success: true,
      message: item_id ? 'Item updated successfully!' : 'Item created successfully!',
      itemId: result,
    });
  } catch (error) {
    console.error('Error saving item:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to save item. Please try again.',
    });
  }
}

async function deleteItem(req, res) {
  try {
    const { id } = req.params;
    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated.',
      });
    }

    // Soft delete - just deactivate
    await inventoryModel.updateItem({
      itemId: id,
      isActive: 0,
      userId,
    });

    return res.json({
      success: true,
      message: 'Item deactivated successfully.',
    });
  } catch (error) {
    console.error('Error deleting item:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete item. Please try again.',
    });
  }
}

// =============================================
// STOCK ADJUSTMENT CONTROLLERS
// =============================================

async function getAdjustmentPage(req, res) {
  try {
    const reasons = await inventoryModel.getAdjustmentReasons();
    const stats = await inventoryModel.getAdjustmentStats();

    res.render('inventory/adjustment', {
      title: 'Stock Adjustment',
      reasons,
      stats,
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading adjustment page:', error);
    res.status(500).render('error', {
      error: 'Failed to load adjustment page.',
    });
  }
}

async function getAdjustmentReasons(req, res) {
  try {
    const { type } = req.query;
    const reasons = await inventoryModel.getAdjustmentReasons(type);
    return res.json({ reasons });
  } catch (error) {
    console.error('Error fetching adjustment reasons:', error);
    return res.status(500).json({
      error: 'Failed to fetch reasons',
    });
  }
}

async function getAdjustmentList(req, res) {
  try {
    const { page = 1, status, startDate, endDate, search, limit = 20, format } = req.query;

    const result = await inventoryModel.getAdjustments({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      startDate,
      endDate,
      search,
    });

    // If JSON format requested
    if (format === 'json') {
      return res.json({
        adjustments: result.adjustments,
        pagination: {
          currentPage: result.page,
          totalPages: result.totalPages,
          totalItems: result.total,
          limit: result.limit,
        },
      });
    }

    // Otherwise render HTML
    res.render('inventory/adjustment-list', {
      title: 'Adjustment History',
      adjustments: result.adjustments,
      pagination: {
        currentPage: result.page,
        totalPages: result.totalPages,
        totalItems: result.total,
        limit: result.limit,
      },
      filters: { status, startDate, endDate, search },
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading adjustment list:', error);
    res.status(500).render('error', {
      error: 'Failed to load adjustment list.',
    });
  }
}

async function getAdjustmentDetails(req, res) {
  try {
    const { id } = req.params;
    const adjustment = await inventoryModel.getAdjustmentById(id);

    if (!adjustment) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    return res.json({ adjustment });
  } catch (error) {
    console.error('Error getting adjustment details:', error);
    return res.status(500).json({
      error: 'Failed to get adjustment details',
    });
  }
}

async function saveAdjustment(req, res) {
  try {
    const { item_id, quantity, reason_id, adjustment_type, remarks } = req.body;
    const userId = req.session.user?.id;

    // Validate user
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated.',
      });
    }

    // Validate inputs
    if (!item_id) {
      return res.status(400).json({
        success: false,
        message: 'Please select an item.',
      });
    }

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid quantity.',
      });
    }

    if (!reason_id) {
      return res.status(400).json({
        success: false,
        message: 'Please select a reason.',
      });
    }

    if (!adjustment_type || !['add', 'subtract'].includes(adjustment_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid adjustment type.',
      });
    }

    // Get item details for response
    const item = await inventoryModel.getItemById(item_id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found.',
      });
    }

    // Check stock for subtraction
    if (adjustment_type === 'subtract' && quantity > item.stock) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${item.stock} ${item.item_unit}`,
        available: item.stock,
      });
    }

    // Create adjustment
    const result = await inventoryModel.createAdjustment({
      itemId: item_id,
      quantity: parseInt(quantity),
      reasonId: reason_id,
      adjustmentType: adjustment_type,
      remarks: remarks || null,
      userId,
    });

    // Get the created adjustment for response
    const adjustment = await inventoryModel.getAdjustmentById(result.adjustmentId);

    return res.json({
      success: true,
      message: 'Adjustment created successfully! Waiting for approval.',
      adjustment: adjustment,
    });
  } catch (error) {
    console.error('Error saving adjustment:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to save adjustment. Please try again.',
    });
  }
}

async function approveAdjustment(req, res) {
  try {
    const { id } = req.params;
    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated.',
      });
    }

    await inventoryModel.approveAdjustment({
      adjustmentId: id,
      userId,
    });

    return res.json({
      success: true,
      message: 'Adjustment approved successfully!',
    });
  } catch (error) {
    console.error('Error approving adjustment:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to approve adjustment.',
    });
  }
}

async function rejectAdjustment(req, res) {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated.',
      });
    }

    await inventoryModel.rejectAdjustment({
      adjustmentId: id,
      userId,
      rejectionReason: rejection_reason || null,
    });

    return res.json({
      success: true,
      message: 'Adjustment rejected.',
    });
  } catch (error) {
    console.error('Error rejecting adjustment:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to reject adjustment.',
    });
  }
}

// =============================================
// REQUEST APPROVAL CONTROLLERS
// =============================================

async function getApprovalDashboard(req, res) {
  try {
    const stats = await inventoryModel.getRequestStats();
    const pendingRequests = await inventoryModel.getPendingRequests({ limit: 10 });

    res.render('inventory/approval-dashboard', {
      title: 'Request Approval',
      stats,
      pendingRequests: pendingRequests.requests,
      username: req.session.user?.username,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Error loading approval dashboard:', error);
    res.status(500).render('error', {
      error: 'Failed to load approval dashboard.',
    });
  }
}

async function getPendingRequests(req, res) {
  try {
    const { page = 1, search, startDate, endDate, format } = req.query;

    const result = await inventoryModel.getPendingRequests({
      page: parseInt(page),
      limit: 20,
      search,
      startDate,
      endDate,
    });

    if (format === 'json') {
      return res.json({
        requests: result.requests,
        pagination: {
          currentPage: result.page,
          totalPages: result.totalPages,
          totalItems: result.total,
          limit: result.limit,
        },
      });
    }

    res.render('inventory/pending-requests', {
      title: 'Pending Requests',
      requests: result.requests,
      pagination: {
        currentPage: result.page,
        totalPages: result.totalPages,
        totalItems: result.total,
        limit: result.limit,
      },
      filters: { search, startDate, endDate },
      username: req.session.user?.username,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Error loading pending requests:', error);
    res.status(500).render('error', {
      error: 'Failed to load pending requests.',
    });
  }
}

async function getRequestApprovalPage(req, res) {
  try {
    const { id } = req.params;

    const request = await inventoryModel.getRequestForApproval(id);
    if (!request) {
      return res.status(404).render('error', {
        error: 'Request not found',
      });
    }

    const items = await inventoryModel.getRequestItemsWithStock(id);

    res.render('inventory/request-approval', {
      title: 'Request Approval',
      request,
      items,
      username: req.session.user?.username,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Error loading request approval page:', error);
    res.status(500).render('error', {
      error: 'Failed to load request approval page.',
    });
  }
}

async function approveRequest(req, res) {
  try {
    const { id } = req.params;
    const { remarks } = req.body;
    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated.',
      });
    }

    await inventoryModel.approveRequest({
      requestId: id,
      userId,
      remarks: remarks || null,
    });

    return res.json({
      success: true,
      message: 'Request approved successfully! Stock has been deducted.',
    });
  } catch (error) {
    console.error('Error approving request:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to approve request.',
    });
  }
}

async function rejectRequest(req, res) {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated.',
      });
    }

    if (!rejection_reason || !rejection_reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a reason for rejection.',
      });
    }

    await inventoryModel.rejectRequest({
      requestId: id,
      userId,
      rejectionReason: rejection_reason.trim(),
    });

    return res.json({
      success: true,
      message: 'Request rejected successfully.',
    });
  } catch (error) {
    console.error('Error rejecting request:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to reject request.',
    });
  }
}

// async function getMyRequests(req, res) {
//   try {
//     const userId = req.session.user?.id;
//     const { page = 1, status } = req.query;

//     const result = await inventoryModel.getUserRequests({
//       userId,
//       page: parseInt(page),
//       limit: 20,
//       status,
//     });

//     res.render('inventory/my-requests', {
//       title: 'My Requests',
//       requests: result.requests,
//       pagination: {
//         currentPage: result.page,
//         totalPages: result.totalPages,
//         totalItems: result.total,
//         limit: result.limit,
//       },
//       filters: { status },
//       username: req.session.user?.username,
//       user: req.session.user,
//     });
//   } catch (error) {
//     console.error('Error loading my requests:', error);
//     res.status(500).render('error', {
//       error: 'Failed to load your requests.',
//     });
//   }
// }

// =============================================
// MY REQUESTS - User's personal request view
// =============================================

async function getMyRequests(req, res) {
  console.log('my requests: ', req);
  try {
    const userId = req.session.user?.id;
    const { page = 1, status = null, search = '' } = req.query;

    if (!userId) {
      return res.status(401).render('error', {
        error: 'User not authenticated.',
      });
    }

    const result = await inventoryModel.getUserRequests({
      userId,
      page: parseInt(page),
      limit: 20,
      status,
      search,
    });

    const stats = await inventoryModel.getUserRequestStats(userId);

    res.render('inventory/my-requests', {
      title: 'My Requests',
      requests: result.requests,
      stats,
      pagination: {
        currentPage: result.page,
        totalPages: result.totalPages,
        totalItems: result.total,
        limit: result.limit,
      },
      filters: { status, search },
      username: req.session.user?.username,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Error loading my requests:', error);
    res.status(500).render('error', {
      error: 'Failed to load your requests.',
    });
  }
}

async function getRequestStatus(req, res) {
  try {
    const { id } = req.params;
    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated.',
      });
    }

    const request = await inventoryModel.getRequestForApproval(id);

    // Check if this request belongs to the user
    if (request.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this request.',
      });
    }

    const items = await inventoryModel.getRequestItemsWithStock(id);

    return res.json({
      success: true,
      request,
      items,
    });
  } catch (error) {
    console.error('Error getting request status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get request status.',
    });
  }
}

async function cancelRequest(req, res) {
  try {
    const { id } = req.params;
    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated.',
      });
    }

    // Check if request belongs to user and is pending
    const request = await inventoryModel.getRequestForApproval(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found.',
      });
    }

    if (request.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to cancel this request.',
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a request that is already ${request.status}.`,
      });
    }

    // Update status to cancelled
    await inventoryModel.cancelRequest({
      requestId: id,
      userId,
    });

    return res.json({
      success: true,
      message: 'Request cancelled successfully.',
    });
  } catch (error) {
    console.error('Error cancelling request:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel request.',
    });
  }
}

// =============================================
// INVENTORY REPORTS CONTROLLERS
// =============================================

async function getReportsDashboard(req, res) {
  try {
    const metrics = await inventoryModel.getDashboardMetrics();

    res.render('inventory/reports/dashboard', {
      title: 'Inventory Reports',
      metrics,
      username: req.session.user?.username,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Error loading reports dashboard:', error);
    res.status(500).render('error', {
      error: 'Failed to load reports dashboard.',
    });
  }
}

async function getRequestSummaryReport(req, res) {
  try {
    const { startDate, endDate, status, userId } = req.query;
    const report = await inventoryModel.getRequestSummaryReport({
      startDate,
      endDate,
      status,
      userId,
    });

    // Get users for dropdown
    const users = await inventoryModel.getUsersForDropdown();

    res.render('inventory/reports/request-summary', {
      title: 'Request Summary Report',
      report,
      users,
      filters: { startDate, endDate, status, userId },
      username: req.session.user?.username,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Error generating request summary report:', error);
    res.status(500).render('error', {
      error: 'Failed to generate report.',
    });
  }
}

async function getMovementReport(req, res) {
  try {
    const { startDate, endDate, itemId, transactionType } = req.query;
    const report = await inventoryModel.getInventoryMovementReport({
      startDate,
      endDate,
      itemId,
      transactionType,
    });

    // Get items for dropdown
    const items = await inventoryModel.getAllItems({ limit: 100 });

    res.render('inventory/reports/movement', {
      title: 'Inventory Movement Report',
      report,
      items: items.items,
      filters: { startDate, endDate, itemId, transactionType },
      username: req.session.user?.username,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Error generating movement report:', error);
    res.status(500).render('error', {
      error: 'Failed to generate report.',
    });
  }
}

async function getStockStatusReport(req, res) {
  try {
    const { minStock, maxStock, showInactive } = req.query;
    const report = await inventoryModel.getStockStatusReport({
      minStock: minStock ? parseInt(minStock) : null,
      maxStock: maxStock ? parseInt(maxStock) : null,
      showInactive: showInactive === 'true',
    });

    res.render('inventory/reports/stock-status', {
      title: 'Stock Status Report',
      report,
      filters: { minStock, maxStock, showInactive },
      username: req.session.user?.username,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Error generating stock status report:', error);
    res.status(500).render('error', {
      error: 'Failed to generate report.',
    });
  }
}

async function getUserActivityReport(req, res) {
  try {
    const { startDate, endDate, userId } = req.query;
    const report = await inventoryModel.getUserActivityReport({
      startDate,
      endDate,
      userId,
    });

    // Calculate totals
    const totals = {
      totalRequests: report.reduce((sum, user) => sum + (user.total_requests || 0), 0),
      totalApproved: report.reduce((sum, user) => sum + (user.approved || 0), 0),
      totalRejected: report.reduce((sum, user) => sum + (user.rejected || 0), 0),
      totalPending: report.reduce((sum, user) => sum + (user.pending || 0), 0),
      totalItems: report.reduce((sum, user) => sum + (user.total_items || 0), 0),
    };

    // Get users for dropdown
    const users = await inventoryModel.getUsersForDropdown();

    res.render('inventory/reports/user-activity', {
      title: 'User Activity Report',
      report,
      totals, // ← Pass totals to view
      users,
      filters: { startDate, endDate, userId },
      username: req.session.user?.username,
      user: req.session.user,
    });
  } catch (error) {
    console.error('Error generating user activity report:', error);
    res.status(500).render('error', {
      error: 'Failed to generate report.',
    });
  }
}

// Export reports as Excel
async function exportReportExcel(req, res) {
  try {
    const { type, ...filters } = req.query;
    let data = [];
    let filename = '';

    switch (type) {
      case 'request-summary':
        data = await inventoryModel.getRequestSummaryReport(filters);
        filename = 'request-summary-report';
        break;
      case 'movement':
        data = await inventoryModel.getInventoryMovementReport(filters);
        filename = 'inventory-movement-report';
        break;
      case 'stock-status':
        data = await inventoryModel.getStockStatusReport(filters);
        filename = 'stock-status-report';
        break;
      case 'user-activity':
        data = await inventoryModel.getUserActivityReport(filters);
        filename = 'user-activity-report';
        break;
      default:
        throw new Error('Invalid report type');
    }

    // Generate Excel using your preferred library
    // For now, return JSON
    res.json({
      success: true,
      message: 'Export functionality to be implemented',
      data,
    });
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export report.',
    });
  }
}

module.exports = {
  getRequestPage,
  searchItems,
  getItemDetails,
  getRequestReasons,
  saveRequest,
  getItemEntryPage,
  getItemListPage,
  getItemEditPage,
  saveItem,
  deleteItem,
  getAdjustmentPage,
  getAdjustmentReasons,
  getAdjustmentList,
  getAdjustmentDetails,
  saveAdjustment,
  approveAdjustment,
  rejectAdjustment,
  getApprovalDashboard,
  getPendingRequests,
  getRequestApprovalPage,
  approveRequest,
  rejectRequest,
  getMyRequests,
  cancelRequest,
  getRequestStatus,
  getReportsDashboard,
  getRequestSummaryReport,
  getMovementReport,
  getStockStatusReport,
  getUserActivityReport,
  exportReportExcel,
};
