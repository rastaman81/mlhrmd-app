// recordsController.js
const utilitiesModel = require('../models/utilitiesModel');
const recordsModel = require('../models/recordsModel');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path'); // ← ADD THIS
const fs = require('fs');

// const showEmployeeEntryPage = async (req, res) => {
//   try {
//     const offices = await utilitiesModel.getOffice();
//     const maritalStatuses = await utilitiesModel.getMaritalStatus();
//     const designations = await utilitiesModel.getPayrollDesignations();
//     const employmentStatuses = await utilitiesModel.getPayrollStatus();

//     res.render("records/records-employee-entry", {
//       offices,
//       maritalStatuses,
//       designations,
//       employmentStatuses,
//     });
//   } catch (error) {
//     console.error("Error loading employee entry page:", error);
//     res.status(500).render("error");
//   }
// };

const showEmployeeEntryPage = async (req, res) => {
  try {
    const offices = await utilitiesModel.getOffice();

    res.render('records/employee-entry-office', {
      title: 'Employee Entry',
      offices,
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading employee entry page:', error);
    res.status(500).render('error', {
      error: 'Failed to load employee entry page.',
    });
  }
};

//START EMPLOYEE ENTRY
const handleEmployeeEntryOfficeSelection = async (req, res) => {
  try {
    const { office } = req.query;

    if (!office) {
      return res.redirect('/records/employee-entry');
    }

    const hasApplicantModule = recordsModel.officeHasApplicantModule(office);

    if (hasApplicantModule) {
      return res.redirect(
        `/records/employee-entry/applicants?office=${encodeURIComponent(office)}`,
      );
    }

    return res.redirect(`/records/employee-entry/form?office=${encodeURIComponent(office)}`);
  } catch (error) {
    console.error('Error handling office selection:', error);
    res.status(500).render('error', {
      error: 'Failed to process office selection.',
    });
  }
};
const showApplicantSearchPage = async (req, res) => {
  try {
    const { office, keyword } = req.query;

    if (!office) {
      return res.redirect('/records/employee-entry');
    }

    const hasApplicantModule = recordsModel.officeHasApplicantModule(office);

    if (!hasApplicantModule) {
      return res.redirect(`/records/employee-entry/form?office=${encodeURIComponent(office)}`);
    }

    let applicants = [];

    if (keyword && keyword.trim() !== '') {
      applicants = await recordsModel.searchApplicants({
        office,
        keyword: keyword.trim(),
      });

      // Map onboarded numeric value to human-readable status
      applicants = applicants.map((a) => ({
        ...a,
        statusText: a.onboarded ? 'On-board Applicant' : 'Not On-boarded',
      }));
    }

    res.render('records/employee-entry-applicant-search', {
      title: 'Applicant Search',
      office,
      keyword: keyword || '',
      applicants,
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading applicant search page:', error);
    res.status(500).render('error', {
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Failed to load applicant search page.',
      layout: false,
    });
  }
};

const showEmployeeEntryForm = async (req, res) => {
  try {
    const { office, applicantId } = req.query;
    console.log('********************** : ', office, applicantId);
    if (!office) {
      return res.redirect('/records/employee-entry');
    }

    const [offices, maritalStatuses, designations, employmentStatuses, ranking, civilStatus] =
      await Promise.all([
        utilitiesModel.getOffice(),
        utilitiesModel.getMaritalStatus(),
        utilitiesModel.getDesignations(office),
        utilitiesModel.getEmployeeStatuses(),
        recordsModel.getRankingByOffice(office),
        utilitiesModel.getCivilStatus(),
      ]);

    let applicantData = null;

    if (applicantId) {
      applicantData = await recordsModel.getApplicantById({
        office,
        applicantId,
      });

      if (!applicantData) {
        return res.status(404).render('error', {
          error: 'Applicant not found.',
        });
      }

      if (Number(applicantData.onboarded) !== 0 || applicantData.onboarded === null) {
        return res.status(400).render('error', {
          error: 'This applicant has already been on-boarded.',
        });
      }
    }

    res.render('records/records-employee-entry', {
      title: 'Employee Entry',
      offices,
      selectedOffice: office,
      applicantData,
      maritalStatuses,
      designations,
      employmentStatuses,
      ranking,
      civilStatus,
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading employee entry form:', error);
    res.status(500).render('error', {
      error: 'Failed to load employee entry form.',
    });
  }
};
//END EMPLOYEE ENTRY

// const saveEmployee = async (req, res) => {
//   try {
//     const employeeData = req.body;

//     if (
//       !employeeData.idno ||
//       !employeeData.lastname ||
//       !employeeData.firstname
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Required fields are missing",
//       });
//     }

//     const exists = await recordsModel.employeeExists(
//       employeeData.idno,
//       employeeData.office,
//     );

//     if (exists) {
//       return res.status(409).json({
//         success: false,
//         message: "Employee ID already exists",
//       });
//     }

//     await recordsModel.createEmployee(employeeData);

//     res.json({
//       success: true,
//       message: "Employee record successfully created",
//     });
//   } catch (error) {
//     console.error("Error saving employee:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to save employee record",
//     });
//   }
// };

// START SAVE EMPLOYEE
const saveEmployee = async (req, res) => {
  try {
    console.log(
      'Employee status:',
      req.body.employmentStatus,
      'status text: ',
      req.body.employmentStatusText,
    );

    const employeeData = {
      applicantId: req.body.applicant_id || req.body.applicantId || null,

      office: req.body.office,

      lastName: req.body.employeelname,
      firstName: req.body.employeefname,
      middleInitial: req.body.employeemi || '',

      designation: req.body.designation,
      designationId: req.body.designationId || req.body.designation_id || null, // ADD THIS
      region: req.body.region,
      manager: req.body.area,
      branch: req.body.branch,

      dateOfEmployment: req.body.employeedateemp,
      rank: req.body.rank,
      employmentStatusText: req.body.employmentStatusText,
      resignedDate: req.body.resignedDate || null,

      contactNo: req.body.employeecontactno,
      walletNo: req.body.walletno,
      email: req.body.employeeemail,

      gender: req.body.employeegender,
      civilStatus: req.body.civilStatus,
      birthDate: req.body.employeebdate,
      birthPlace: req.body.employeebplace,
      religion: req.body.employeereligion,
      address: req.body.employeeaddress,

      spouse: req.body.employeespouse,
      spouseWork: req.body.employeespousework,
      fatherName: req.body.employeefathersname,
      fatherWork: req.body.employeefatherswork,
      motherName: req.body.employeemothersname,
      motherWork: req.body.employeemotherwork,

      school1: req.body.employeeschool1,
      school1Address: req.body.employeeaddress1,
      school1YearGraduated: req.body.employeescyear1,

      school2: req.body.employeeschool2,
      school2Address: req.body.employeeaddress2,
      school2YearGraduated: req.body.employeescyear2,

      college: req.body.employeeschool3,
      collegeAddress: req.body.employeeaddress3,
      course: req.body.employeeschool4,
      collegeYearGraduated: req.body.employeescyear3,
      major: req.body.employeeaddress4,

      sssNo: req.body.employeesss,
      pagIbigNo: req.body.employeepagibig,
      philhealth: req.body.employeephilhealth,
      tin: req.body.employeetin,

      employment_status: req.body.employmentStatus,
    };

    const newId = await recordsModel.saveEmployeeToMaster(employeeData);

    return res.json({
      success: true,
      employeeId: newId,
      lastName: employeeData.lastName,
      firstName: employeeData.firstName,
      middleInitial: employeeData.middleInitial,
    });
  } catch (error) {
    console.error('Error saving employee:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error',
    });
  }
};
// END SAVE EMPLOYEE

async function getRecordsReportsPage(req, res) {
  try {
    const [offices, reportTypes, incomeTypes, deductionTypes] = await Promise.all([
      utilitiesModel.getOffice(),
      utilitiesModel.getRecordsReportTypes(),
      utilitiesModel.getPayrollIncomeTypes(),
      utilitiesModel.getPayrollDeductionTypes(),
    ]);

    res.render('records/records-reports', {
      title: 'Employee Records Reports',
      offices,
      reportTypes,
      incomeTypes,
      deductionTypes,
      username: req.session.user.username,
    });
  } catch (error) {
    console.error('Error loading payroll reports page:', error);
    res.status(500).render('error', {
      error: 'Error loading payroll reports page',
    });
  }
}

async function getRegionsByOffice(req, res) {
  try {
    const { office } = req.query;

    if (!office) {
      return res.json({
        success: false,
        message: 'Office parameter is required',
      });
    }

    const regions = await utilitiesModel.getRecordsRegions(office);

    res.json({
      success: true,
      regions,
    });
  } catch (error) {
    console.error('Error fetching regions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching regions',
    });
  }
}

async function getAreasByOffice(req, res) {
  try {
    const { office } = req.query;
    const { region } = req.query;
    console.log('???? ', region);

    if (!office) {
      return res.json({
        success: false,
        message: 'Office parameter is required',
      });
    }
    console.log(region);
    const areas = await utilitiesModel.getRecordsAreas(office, region);

    res.json({
      success: true,
      areas,
    });
  } catch (error) {
    console.error('Error fetching areas:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching areas',
    });
  }
}

async function getBranchesByOffice(req, res) {
  try {
    const { office } = req.query;
    const { region } = req.query;
    const { area } = req.query;

    if (!office) {
      return res.json({
        success: false,
        message: 'Office parameter is required',
      });
    }
    console.log('getBranchesByOffice called with:', { office, region, area });
    const branches = await utilitiesModel.getRecordsBranches(office, region, area);
    console.log('branches result:', branches);

    res.json({
      success: true,
      branches,
    });
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching branches',
    });
  }
}

async function getEmployeeStatuses(req, res) {
  try {
    // if (!office) {
    //   return res.json({
    //     success: false,
    //     message: "Office parameter is required",
    //   });
    // }

    const statuses = await utilitiesModel.getEmployeeStatuses();

    res.json({
      success: true,
      statuses,
    });
  } catch (error) {
    console.error('Error fetching employee statuses:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching branches',
    });
  }
}

async function getSortOptions(req, res) {
  try {
    // if (!office) {
    //   return res.json({
    //     success: false,
    //     message: "Office parameter is required",
    //   });
    // }

    const options = await utilitiesModel.getSortOptions();

    res.json({
      success: true,
      options,
    });
  } catch (error) {
    console.error('Error fetching sort toptions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching branches',
    });
  }
}

async function getDesignationsForReports(req, res) {
  try {
    const designations = await recordsModel.getAllDesignations();

    res.json({
      success: true,
      designations,
    });
  } catch (error) {
    console.error('Error fetching designations for reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching designations',
    });
  }
}

async function getEmployeeTypes(req, res) {
  try {
    // if (!office) {
    //   return res.json({
    //     success: false,
    //     message: "Office parameter is required",
    //   });
    // }

    const types = await utilitiesModel.getEmployeeTypes();

    res.json({
      success: true,
      types,
    });
  } catch (error) {
    console.error('Error fetching employee types:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching branches',
    });
  }
}

async function generateRecordsReport(req, res) {
  try {
    const {
      reportType,
      office,
      region,
      area,
      branch,
      status,
      employeeType,
      designation,
      sortBy,
      extraColumns,
      dateFrom,
      dateTo,
      dateFilterType,
      page = 1,
      limit = 30,
    } = req.body;

    if (!reportType) {
      return res.json({
        success: false,
        message: 'Report type is required',
      });
    }

    let result;

    // VALIDATION: Active status cannot use resignation date filter
    if (status && Number(status) === 9 && req.body.dateFilterType === 'resignation_date') {
      console.warn('Controller: Active status with resignation date filter detected. Overriding.');
      // Override to prevent empty results
      req.body.dateFilterType = 'date_hired';
    }

    // In recordsController.js - generateRecordsReport function
    switch (reportType.toLowerCase()) {
      case 'employee master list':
        result = await recordsModel.getEmployeeMasterlist({
          office,
          region,
          area,
          branch,
          status,
          employeeType,
          designation,
          sortBy,
          extraColumns,
          dateFrom,
          dateTo,
          dateFilterType,
          page: Number(page),
          limit: Number(limit),
        });
        break;

      case 'new hires report': // Add this case
        result = await recordsModel.getNewHires({
          office,
          region,
          sortBy: sortBy || 'lastname',
          dateFrom,
          dateTo,
          page: Number(page),
          limit: Number(limit),
        });
        break;

      default:
        return res.json({
          success: false,
          message: 'Invalid report type',
        });
    }

    return res.json({
      success: true,
      data: result.rows || [],
      total: result.total || 0,
      totalPages: result.totalPages || 0,
      page: result.currentPage || 1,
      limit: Number(limit) || 30,
    });
  } catch (error) {
    console.error('Error generating report:', error);
    return res.json({
      success: false,
      message: error.message,
    });
  }
}

async function exportMasterlistExcel(req, res) {
  try {
    const filters = { ...req.query, page: 1, limit: 100000 };
    const result = await recordsModel.getEmployeeMasterlist(filters);
    const rows = result.rows || [];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Employee Masterlist');

    if (rows.length === 0) {
      worksheet.addRow(['No data found']);
    } else {
      const headers = Object.keys(rows[0]);
      worksheet.addRow(headers);

      rows.forEach((row) => {
        worksheet.addRow(Object.values(row));
      });

      worksheet.getRow(1).font = { bold: true };

      // --- NEW: total count footer ---
      worksheet.addRow([]); // spacer
      const totalRow = worksheet.addRow([`Total Employees: ${rows.length}`]);
      totalRow.font = { bold: true };
      worksheet.mergeCells(`A${totalRow.number}:${columnLetter(headers.length)}${totalRow.number}`);
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const filename = generateFileName('employee_masterlist', 'xlsx', req.query.office);
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).send('Error exporting Excel');
  }
}

function columnLetter(n) {
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

async function exportMasterlistPDF(req, res) {
  try {
    const filters = {
      ...req.query,
      page: 1,
      limit: 100000,
    };

    const result = await recordsModel.getEmployeeMasterlist(filters);
    const rows = result.rows || [];

    const doc = new PDFDocument({
      margin: 25,
      size: [936, 612], // 13 x 8.5 inches landscape
    });

    res.setHeader('Content-Type', 'application/pdf');
    const filename = generateFileName('employee_masterlist', 'pdf', req.query.office);

    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    doc.pipe(res);

    if (rows.length === 0) {
      doc.fontSize(11).text('No data found.');
      doc.end();
      return;
    }

    const headers = Object.keys(rows[0]);
    const pageWidth = 936;
    const pageHeight = 612;
    const marginLeft = 25;
    const marginRight = 25;
    const usableWidth = pageWidth - marginLeft - marginRight;
    const columnWidth = usableWidth / headers.length;
    const bottomLimit = pageHeight - 35;

    function formatPdfDate(value) {
      if (!value) return '';

      const date = new Date(value);

      if (isNaN(date.getTime())) {
        return value;
      }

      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();

      return `${month}/${day}/${year}`;
    }

    function cleanValue(key, value) {
      let displayValue = value;

      if (displayValue === undefined || displayValue === null) {
        return '';
      }

      if (
        displayValue &&
        (key.toLowerCase().includes('date') ||
          key.toLowerCase().includes('birth') ||
          key.toLowerCase().includes('hired'))
      ) {
        displayValue = formatPdfDate(displayValue);
      }

      return String(displayValue);
    }

    function drawPdfHeader() {
      doc.font('Helvetica-Bold').fontSize(14);
      doc.text('Employee Master List', marginLeft, 20, {
        width: usableWidth,
        align: 'center',
      });

      const headerY = 55;

      doc.font('Helvetica-Bold').fontSize(7);

      headers.forEach((header, index) => {
        doc.text(header, marginLeft + index * columnWidth, headerY, {
          width: columnWidth,
          align: 'left',
        });
      });

      doc
        .moveTo(marginLeft, headerY + 18)
        .lineTo(pageWidth - marginRight, headerY + 18)
        .stroke();

      doc.font('Helvetica').fontSize(7);

      return headerY + 28;
    }

    let y = drawPdfHeader();

    rows.forEach((row) => {
      const values = Object.entries(row);
      let rowHeight = 18;

      values.forEach(([key, value]) => {
        const displayValue = cleanValue(key, value);

        const height = doc.heightOfString(displayValue, {
          width: columnWidth,
          align: 'left',
        });

        rowHeight = Math.max(rowHeight, height + 6);
      });

      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = drawPdfHeader();
      }

      values.forEach(([key, value], index) => {
        const displayValue = cleanValue(key, value);

        doc.text(displayValue, marginLeft + index * columnWidth, y, {
          width: columnWidth,
          align: 'left',
        });
      });

      y += rowHeight;
    });
    if (y + 30 > bottomLimit) {
      doc.addPage();
      y = drawPdfHeader();
    }

    doc
      .moveTo(marginLeft, y + 6)
      .lineTo(pageWidth - marginRight, y + 6)
      .stroke();

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(`Total Employees: ${rows.length}`, marginLeft, y + 14);

    doc.end();
  } catch (error) {
    console.error('Error exporting PDF:', error);
    res.status(500).send('Error exporting PDF');
  }
}

function generateFileName(baseName, ext, office = '') {
  const now = new Date();

  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toTimeString().slice(0, 8).replace(/:/g, ''); // HHMMSS

  // 🔥 sanitize office (important)
  const cleanOffice = office
    ? office
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
    : 'all';

  return `${baseName}_${cleanOffice}_${date}_${time}.${ext}`;
}

//START -> REGION MANAGEMENT
// START -> REGION MANAGEMENT

async function getRegionManagementPage(req, res) {
  try {
    const [offices] = await Promise.all([utilitiesModel.getOffice()]);

    res.render('records/region-management', {
      title: 'Region Management',
      offices,
    });
  } catch (error) {
    console.error('Error loading Region Management page:', error);

    res.status(500).render('error', {
      error: 'Failed to load Region Management page.',
    });
  }
}

// SEARCH EMPLOYEE

async function searchRegionManager(req, res) {
  try {
    const { keyword, office, type } = req.query;

    if (!office) {
      return res.json({
        success: false,
        message: 'Office is required.',
        data: [],
      });
    }

    if (!keyword || keyword.trim() === '') {
      return res.json({
        success: false,
        message: 'Search keyword is required.',
        data: [],
      });
    }

    const employees = await recordsModel.searchRegionManager(keyword, office, type);

    return res.json({
      success: true,
      data: employees,
    });
  } catch (error) {
    console.error('Error searching region manager:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to search employees.',
    });
  }
}

// SAVE REGION

async function saveRegion(req, res) {
  try {
    const { office, type, regionName, regionManagerId, subUnits, regionManagerName } = req.body;

    console.log('Incoming Region Payload:', req.body);

    // VALIDATIONS

    if (!office) {
      return res.json({
        success: false,
        message: 'Office is required.',
      });
    }

    if (!type) {
      return res.json({
        success: false,
        message: 'Type is required.',
      });
    }

    if (!regionName || regionName.trim() === '') {
      return res.json({
        success: false,
        message: 'Region/group name is required.',
      });
    }

    if (!regionManagerId) {
      return res.json({
        success: false,
        message: 'Region/division head is required.',
      });
    }

    // CHECK DUPLICATE REGION

    const duplicateRegion = await recordsModel.findRegionByName(regionName, office);

    if (duplicateRegion) {
      return res.json({
        success: false,
        message: 'Region/group name already exists.',
      });
    }

    // VALIDATE REGION HEAD

    const regionHead = await recordsModel.findActiveEmployeeById(regionManagerId, office);

    if (!regionHead) {
      return res.json({
        success: false,
        message: 'Selected region/division head is invalid or inactive.',
      });
    }

    // VALIDATE SUB UNITS

    if (subUnits && Array.isArray(subUnits)) {
      for (const unit of subUnits) {
        // NAME REQUIRED

        if (!unit.name || unit.name.trim() === '') {
          return res.json({
            success: false,
            message: 'All areas/departments must have a name.',
          });
        }

        // MANAGER REQUIRED

        if (!unit.managerId) {
          return res.json({
            success: false,
            message: `Please assign a manager/head for "${unit.name}".`,
          });
        }

        // VALIDATE EMPLOYEE

        const employee = await recordsModel.findActiveEmployeeById(unit.managerId, office);

        if (!employee) {
          return res.json({
            success: false,
            message: `Assigned employee for "${unit.name}" is invalid or inactive.`,
          });
        }
      }
    }

    // SAVE REGION

    const savedRegion = await recordsModel.saveRegion({
      office,
      type,
      regionName,
      regionManagerId,
      regionManagerName,
    });

    // SAVE SUB UNITS

    if (subUnits && Array.isArray(subUnits) && subUnits.length > 0) {
      for (const unit of subUnits) {
        await recordsModel.saveSubUnit({
          office,
          regionId: savedRegion.insertId,

          name: unit.name,

          managerId: unit.managerId,
          managerName: unit.managerName,
        });
      }
    }

    return res.json({
      success: true,
      message: 'Region/group saved successfully.',
    });
  } catch (error) {
    console.error('Error saving region:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to save region/group.',
    });
  }
}

// END -> REGION MANAGEMENT

// START -> REGION ADD EDIT
async function getRegionListPage(req, res) {
  try {
    const offices = await utilitiesModel.getOffice();

    const { office } = req.query;

    let regions = [];

    // ONLY LOAD REGIONS IF OFFICE IS SELECTED
    if (office) {
      regions = await recordsModel.getRegionsForMaintenance(office);
    }

    res.render('records/region-list', {
      title: 'Region Management',
      offices,
      selectedOffice: office || '',
      regions,
    });
  } catch (error) {
    console.error('Error loading region list:', error);

    res.status(500).render('error', {
      error: 'Failed to load region list.',
    });
  }
}

async function getRegionCreatePage(req, res) {
  try {
    // const { office } = req.query;
    // if (!office) {
    //   return res.redirect("/records/regions");
    // }
    const offices = await utilitiesModel.getOffice();

    res.render('records/region-management', {
      title: 'Create Region',
      offices,
      isEdit: false,
      regionData: {},
      subUnitsData: [],
    });
  } catch (error) {
    console.error('Error loading create region page:', error);
    res.status(500).render('error', {
      error: 'Failed to load create region page.',
    });
  }
}

async function getRegionEditPage(req, res) {
  try {
    const regionId = req.params.id;
    const { office } = req.query;

    if (!office) {
      return res.status(400).send('Office is required in query string.');
    }

    const offices = await utilitiesModel.getOffice();
    const regionData = await recordsModel.getRegionById(regionId, office);
    const subUnitsData = await recordsModel.getSubUnitsByRegionId(regionId, office);

    if (!regionData) {
      return res.status(404).render('error/404', {
        title: 'Region Not Found',
      });
    }

    regionData.office = office;
    res.render('records/region-management', {
      title: 'Edit Region',
      offices,
      isEdit: true,
      regionData,
      subUnitsData,
    });
  } catch (error) {
    console.error('Error loading edit region page:', error);
    res.status(500).render('error', {
      error: 'Failed to load edit region page.',
    });
  }
}

async function updateRegion(req, res) {
  try {
    const regionId = req.params.id;

    const { office, type, regionName, regionManagerId, regionManagerName, subUnits, status } =
      req.body;

    if (!office) {
      return res.json({
        success: false,
        message: 'Office is required.',
      });
    }

    if (!type) {
      return res.json({
        success: false,
        message: 'Type is required.',
      });
    }

    if (!regionName || regionName.trim() === '') {
      return res.json({
        success: false,
        message: 'Region/group name is required.',
      });
    }

    if (!regionManagerId) {
      return res.json({
        success: false,
        message: 'Region/division head is required.',
      });
    }

    const duplicateRegion = await recordsModel.findRegionByNameExceptId(
      regionName,
      office,
      regionId,
    );

    if (duplicateRegion) {
      return res.json({
        success: false,
        message: 'Region/group name already exists.',
      });
    }

    const regionHead = await recordsModel.findActiveEmployeeById(regionManagerId, office);

    if (!regionHead) {
      return res.json({
        success: false,
        message: 'Selected region/division head is invalid or inactive.',
      });
    }

    if (subUnits && Array.isArray(subUnits)) {
      for (const unit of subUnits) {
        if (!unit.name || unit.name.trim() === '') {
          return res.json({
            success: false,
            message: 'All areas/departments must have a name.',
          });
        }

        if (!unit.managerId) {
          return res.json({
            success: false,
            message: `Please assign a manager/head for "${unit.name}".`,
          });
        }

        const employee = await recordsModel.findActiveEmployeeById(unit.managerId, office);

        if (!employee) {
          return res.json({
            success: false,
            message: `Assigned employee for "${unit.name}" is invalid or inactive.`,
          });
        }
      }
    }

    await recordsModel.updateRegion({
      office,
      regionId,
      type,
      regionName,
      regionManagerId,
      regionManagerName,
      status,
    });

    const submittedAreaIds = [];

    if (subUnits && Array.isArray(subUnits) && subUnits.length > 0) {
      for (const unit of subUnits) {
        const savedUnit = await recordsModel.saveOrUpdateSubUnit({
          office,
          regionId,
          areaId: unit.id || null,
          name: unit.name,
          managerId: unit.managerId,
          managerName: unit.managerName,
        });

        submittedAreaIds.push(savedUnit.areaId);
      }
    }

    await recordsModel.deactivateRemovedSubUnits({
      office,
      regionId,
      submittedAreaIds,
    });

    return res.json({
      success: true,
      message: 'Region/group updated successfully.',
    });
  } catch (error) {
    console.error('Error updating region:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update region/group.',
    });
  }
}
// END -> REGION ADD EDIT

// START UPDATE EMPLOYEE
async function showEmployeeUpdatePage(req, res) {
  try {
    const offices = await utilitiesModel.getOffice();

    res.render('records/employee-update-search', {
      title: 'Employee Update',
      offices,
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading employee update page:', error);
    res.status(500).render('error', {
      error: 'Failed to load employee update page.',
    });
  }
}

// In recordsController.js
async function searchEmployeesForUpdate(req, res) {
  try {
    const { office, lastName, firstName } = req.query;

    if (!office) {
      return res.json({
        success: false,
        message: 'Office is required.',
        employees: [],
      });
    }

    if (!lastName && !firstName) {
      return res.json({
        success: false,
        message: 'At least one name field is required.',
        employees: [],
      });
    }

    const employees = await recordsModel.searchEmployeesForUpdate({
      office,
      lastName,
      firstName,
    });

    return res.json({
      success: true,
      employees,
    });
  } catch (error) {
    console.error('Error searching employees:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search employees.',
    });
  }
}

async function showEmployeeUpdateForm(req, res) {
  try {
    const { employeeId } = req.params;
    const { office } = req.query;

    if (!office) {
      return res.status(400).send('Office is required.');
    }

    const employee = await recordsModel.getEmployeeForUpdate({
      office,
      employeeId,
    });

    if (!employee) {
      return res.status(404).render('error', {
        error: 'Employee not found.',
      });
    }
    console.log(employee);

    // Fetch all required data including education fields
    const [offices, designations, employmentStatuses, ranking, maritalStatuses] = await Promise.all(
      [
        utilitiesModel.getOffice(),
        utilitiesModel.getDesignations(office),
        utilitiesModel.getEmployeeStatuses(),
        recordsModel.getRankingByOffice(office),
        utilitiesModel.getMaritalStatus(),
      ],
    );

    res.render('records/employee-update-form', {
      title: 'Update Employee',
      office,
      offices,
      employee,
      designations,
      employmentStatuses,
      employmentStatus: employmentStatuses,
      ranking,
      maritalStatuses,
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading employee update form:', error);
    res.status(500).render('error', {
      error: 'Failed to load employee update form.',
    });
  }
}

async function updateEmployeeRecord(req, res) {
  try {
    const { employeeId } = req.params;
    const { office } = req.body;

    if (!office) {
      return res.json({
        success: false,
        message: 'Office is required.',
      });
    }

    const employeeData = {
      // Basic Information
      lastName: req.body.employeelname,
      firstName: req.body.employeefname,
      middleInitial: req.body.employeemi || '',
      designation: req.body.designation,
      designationId: req.body.designationId || req.body.designation_id || null, // ADD THIS
      region: req.body.region,
      area: req.body.area,
      branch: req.body.branch,
      dateHired: req.body.employeedateemp,
      rank: req.body.rank,
      employmentStatusText: req.body.employmentStatusText,
      resignedDate: req.body.resignedDate || null,
      // <-- ADD HERE
      employmentStatusRemarks:
        req.body.employmentStatusText?.trim().toUpperCase() === 'ACTIVE'
          ? null
          : req.body.employmentStatusRemarks || null,
      contactNo: req.body.employeecontactno,
      walletNo: req.body.walletno,
      email: req.body.employeeemail,

      // Personal Information
      gender: req.body.employeegender,
      civilStatus: req.body.civilStatus,
      birthDate: req.body.employeebdate,
      birthPlace: req.body.employeebplace,
      religion: req.body.employeereligion,
      address: req.body.employeeaddress,

      // Government IDs
      sssNo: req.body.employeesss,
      pagIbigNo: req.body.employeepagibig,
      philhealth: req.body.employeephilhealth,
      tin: req.body.employeetin,
      employmentStatus: req.body.employmentStatus,

      // Family Information
      employeespouse: req.body.employeespouse,
      employeespousework: req.body.employeespousework,
      employeefathersname: req.body.employeefathersname,
      employeefatherswork: req.body.employeefatherswork,
      employeemothersname: req.body.employeemothersname,
      employeemotherswork: req.body.employeemotherswork,

      // Education Information - ADD THESE
      employeeschool1: req.body.employeeschool1,
      employeeaddress1: req.body.employeeaddress1,
      employeescyear1: req.body.employeescyear1,
      employeeschool2: req.body.employeeschool2,
      employeeaddress2: req.body.employeeaddress2,
      employeescyear2: req.body.employeescyear2,
      employeeschool3: req.body.employeeschool3,
      employeeaddress3: req.body.employeeaddress3,
      employeescyear3: req.body.employeescyear3,
      employeeschool4: req.body.employeeschool4,
      employeeaddress4: req.body.employeeaddress4,
    };

    await recordsModel.updateEmployeeRecord({
      office,
      employeeId,
      employeeData,
    });

    return res.json({
      success: true,
      message: 'Employee record updated successfully.',
      employeeId,
    });
  } catch (error) {
    console.error('Error updating employee:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update employee record.',
    });
  }
}
// END UPDATE EMPLOYEE

// START -> DESIGNATION MANAGEMENT

async function getDesignationManagementPage(req, res) {
  try {
    const designations = await recordsModel.getAllDesignations();

    res.render('records/designation-management', {
      title: 'Designation Management',
      designations,
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading designation management page:', error);
    res.status(500).render('error', {
      error: 'Failed to load designation management page.',
    });
  }
}

async function saveDesignation(req, res) {
  try {
    const { designation } = req.body;

    if (!designation || designation.trim() === '') {
      return res.json({
        success: false,
        message: 'Designation name is required.',
      });
    }

    const duplicateDesignation = await recordsModel.findDesignationByName(designation);

    if (duplicateDesignation) {
      return res.json({
        success: false,
        message: 'Designation already exists.',
      });
    }

    const result = await recordsModel.saveDesignation({
      designation,
      userId: req.session.user?.id,
    });

    return res.json({
      success: true,
      message: 'Designation successfully added.',
      designationId: result.insertId, // ← added
    });
  } catch (error) {
    console.error('Error saving designation:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to save designation.',
    });
  }
}

async function updateDesignation(req, res) {
  try {
    const designationId = req.params.id;
    const { designation } = req.body;

    if (!designation || designation.trim() === '') {
      return res.json({
        success: false,
        message: 'Designation name is required.',
      });
    }

    const duplicateDesignation = await recordsModel.findDesignationByNameExceptId(
      designation,
      designationId,
    );

    if (duplicateDesignation) {
      return res.json({
        success: false,
        message: 'Designation already exists.',
      });
    }

    await recordsModel.updateDesignation({
      designationId,
      designation,
      userId: req.session.user?.id,
    });

    return res.json({
      success: true,
      message: 'Designation successfully updated.',
    });
  } catch (error) {
    console.error('Error updating designation:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update designation.',
    });
  }
}

//START

// END -> DESIGNATION MANAGEMENT

// ======================================================
// BRANCH MANAGEMENT — add these functions to recordsController.js
// ======================================================

// ── PAGE ──────────────────────────────────────────────
async function getBranchManagementPage(req, res) {
  try {
    const offices = await utilitiesModel.getOffice();

    res.render('records/branch-management', {
      title: 'Branch Management',
      offices,
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading Branch Management page:', error);
    res.status(500).render('error', {
      error: 'Failed to load Branch Management page.',
    });
  }
}

// ── REGIONS BY OFFICE (same shape other pages use) ────
async function getRegionsForBranch(req, res) {
  try {
    const { office } = req.query;

    if (!office) {
      return res.json({ success: false, message: 'Office is required.', regions: [] });
    }

    const regions = await recordsModel.getRegionsForMaintenance(office);

    return res.json({ success: true, regions });
  } catch (error) {
    console.error('Error fetching regions for branch management:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch regions.', regions: [] });
  }
}

// ── AREAS BY REGION ───────────────────────────────────
async function getAreasForBranch(req, res) {
  try {
    const { office, regionId } = req.query;

    if (!office || !regionId) {
      return res.json({ success: false, message: 'Office and regionId are required.', areas: [] });
    }

    const areas = await recordsModel.getAreasByRegionId(office, regionId);

    return res.json({ success: true, areas });
  } catch (error) {
    console.error('Error fetching areas for branch management:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch areas.', areas: [] });
  }
}

// ── BRANCHES BY AREA ──────────────────────────────────
async function getBranchesByArea(req, res) {
  try {
    const { office, regionId, areaId } = req.query;

    if (!office || !regionId || !areaId) {
      return res.json({
        success: false,
        message: 'Office, regionId, and areaId are required.',
        branches: [],
      });
    }

    const branches = await recordsModel.getBranchesByArea(office, regionId, areaId);

    return res.json({ success: true, branches });
  } catch (error) {
    console.error('Error fetching branches by area:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch branches.', branches: [] });
  }
}

// ── SAVE NEW BRANCH ───────────────────────────────────
async function saveBranch(req, res) {
  try {
    const { office, branchregid, branchareaid, branch_no, branchname, branchaddress } = req.body;

    if (!office) return res.json({ success: false, message: 'Office is required.' });
    if (!branchregid) return res.json({ success: false, message: 'Region is required.' });
    if (!branchareaid) return res.json({ success: false, message: 'Area is required.' });
    if (!branchname || branchname.trim() === '') {
      return res.json({ success: false, message: 'Branch name is required.' });
    }

    await recordsModel.saveBranch({
      office,
      branchregid,
      branchareaid,
      branch_no: branch_no || null,
      branchname: branchname.trim(),
      branchaddress: branchaddress || null,
    });

    return res.json({ success: true, message: 'Branch saved successfully.' });
  } catch (error) {
    console.error('Error saving branch:', error);
    return res.status(500).json({ success: false, message: 'Failed to save branch.' });
  }
}

// ── UPDATE BRANCH (inline edit) ───────────────────────
async function updateBranch(req, res) {
  try {
    const { id: branchcode } = req.params;
    const { office, branch_no, branchname, branchaddress } = req.body;

    if (!office) return res.json({ success: false, message: 'Office is required.' });
    if (!branchname || branchname.trim() === '') {
      return res.json({ success: false, message: 'Branch name is required.' });
    }

    await recordsModel.updateBranch({
      office,
      branchcode,
      branch_no: branch_no || null,
      branchname: branchname.trim(),
      branchaddress: branchaddress || null,
    });

    return res.json({ success: true, message: 'Branch updated successfully.' });
  } catch (error) {
    console.error('Error updating branch:', error);
    return res.status(500).json({ success: false, message: 'Failed to update branch.' });
  }
}

// ── TRANSFER BRANCH (rezoning) ────────────────────────
// ── TRANSFER BRANCH ────────────────────────────────────
// ── TRANSFER BRANCH ────────────────────────────────────
// ── TRANSFER BRANCH ────────────────────────────────────
async function transferBranch(req, res) {
  try {
    console.log('=== transferBranch controller called ===');
    console.log('req.params:', req.params);
    console.log('req.body:', req.body);

    const { id: branchcode } = req.params;
    const { office, branchregid, branchareaid } = req.body;

    if (!branchcode) {
      return res.status(400).json({
        success: false,
        message: 'Branch code is required.',
      });
    }

    if (!office) {
      return res.status(400).json({
        success: false,
        message: 'Office is required.',
      });
    }

    if (!branchregid) {
      return res.status(400).json({
        success: false,
        message: 'New region is required.',
      });
    }

    if (!branchareaid) {
      return res.status(400).json({
        success: false,
        message: 'New area is required.',
      });
    }

    // Get current branch details to check what's changing
    const currentBranch = await recordsModel.getBranchDetails({ office, branchcode });

    if (!currentBranch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found.',
      });
    }

    // Check if there are actually changes
    if (
      currentBranch.branchregid === Number(branchregid) &&
      currentBranch.branchareaid === Number(branchareaid)
    ) {
      return res.status(400).json({
        success: false,
        message: 'No changes detected. The branch is already in this location.',
      });
    }

    // Perform the transfer with employee updates
    const result = await recordsModel.transferBranch({
      office,
      branchcode,
      branchregid,
      branchareaid,
    });

    return res.json({
      success: true,
      message: `Branch transferred successfully. ${result.affectedEmployees} employee(s) updated.`,
      affectedEmployees: result.affectedEmployees,
      changes: {
        region: {
          from: result.oldRegion,
          to: result.newRegion,
          changed: result.oldRegion !== result.newRegion,
        },
        area: {
          from: result.oldArea,
          to: result.newArea,
          changed: result.oldArea !== result.newArea,
        },
      },
    });
  } catch (error) {
    console.error('Error transferring branch:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to transfer branch.',
    });
  }
}

// ── GET AFFECTED EMPLOYEES PREVIEW ─────────────────────
async function getAffectedEmployeesPreview(req, res) {
  try {
    const { id: branchcode } = req.params;
    const { office, newRegionId, newAreaId } = req.query;

    if (!office || !newRegionId || !newAreaId) {
      return res.json({
        success: false,
        message: 'Office, newRegionId, and newAreaId are required.',
      });
    }

    const employees = await recordsModel.getEmployeesAffectedByTransfer({
      office,
      branchcode,
      newRegionId,
      newAreaId,
    });

    return res.json({
      success: true,
      employees,
      count: employees.length,
    });
  } catch (error) {
    console.error('Error getting affected employees:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get affected employees.',
    });
  }
}

// ── TOGGLE STATUS ─────────────────────────────────────
async function toggleBranchStatus(req, res) {
  try {
    const { id: branchcode } = req.params;
    const { office, is_active } = req.body;

    if (!office) {
      return res.json({
        success: false,
        message: 'Office is required.',
      });
    }

    if (is_active === undefined || is_active === null) {
      return res.json({
        success: false,
        message: 'Status value is required.',
      });
    }

    // If trying to deactivate (is_active = 0), check for active employees
    if (Number(is_active) === 0) {
      // First verify branch exists
      const branchDetails = await recordsModel.getBranchDetails({
        office,
        branchcode,
      });

      if (!branchDetails) {
        return res.json({
          success: false,
          message: 'Branch not found.',
        });
      }

      // Check if branch has active employees
      const hasActiveEmployees = await recordsModel.hasActiveEmployeesInBranch({
        office,
        branchcode,
      });

      if (hasActiveEmployees) {
        return res.json({
          success: false,
          message: 'Cannot deactivate branch with active employees.',
          hasActiveEmployees: true,
        });
      }
    }

    // Proceed with status toggle
    await recordsModel.toggleBranchStatus({
      office,
      branchcode,
      is_active: Number(is_active),
    });

    return res.json({
      success: true,
      message: `Branch ${Number(is_active) === 1 ? 'activated' : 'deactivated'} successfully.`,
    });
  } catch (error) {
    console.error('Error toggling branch status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update branch status.',
    });
  }
}

// ── CHECK BRANCH EMPLOYEES ─────────────────────────────────
// ── CHECK BRANCH EMPLOYEES ─────────────────────────────────
async function checkBranchEmployees(req, res) {
  try {
    const { id: branchcode } = req.params;
    const { office } = req.query;

    if (!office) {
      return res.json({
        success: false,
        message: 'Office is required.',
      });
    }

    // Check if branch has active employees
    const hasActiveEmployees = await recordsModel.hasActiveEmployeesInBranch({
      office,
      branchcode,
    });

    if (!hasActiveEmployees) {
      // No active employees, can proceed with deactivation
      return res.json({
        success: true,
        canDeactivate: true,
        message: 'No active employees found in this branch.',
      });
    }

    // Get the list of active employees with their details
    const employees = await recordsModel.getActiveEmployeesByBranch({
      office,
      branchcode,
    });

    return res.json({
      success: true,
      canDeactivate: false,
      employees: employees,
      employeeCount: employees.length,
      message: `This branch has ${employees.length} active employee(s) assigned.`,
    });
  } catch (error) {
    console.error('Error checking branch employees:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check branch employees.',
    });
  }
}
// ======================================================
// BRANCH MANAGEMENT — Handle Unassigned Branches
// ======================================================

// ── GET BRANCHES WITHOUT AREA ID ──────────────────────
async function getBranchesWithoutArea(req, res) {
  try {
    const { office, regionId } = req.query;

    if (!office || !regionId) {
      return res.json({
        success: false,
        message: 'Office and regionId are required.',
        branches: [],
      });
    }

    const branches = await recordsModel.getBranchesWithoutArea({
      office,
      regionId,
    });

    return res.json({
      success: true,
      branches,
    });
  } catch (error) {
    console.error('Error fetching unassigned branches:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch unassigned branches.',
      branches: [],
    });
  }
}

// ── BULK ASSIGN BRANCHES TO AREA ──────────────────────
async function bulkAssignBranches(req, res) {
  try {
    const { office, branchAreaId, branchCodes } = req.body;

    if (!office) {
      return res.json({ success: false, message: 'Office is required.' });
    }

    if (!branchAreaId) {
      return res.json({ success: false, message: 'Target area is required.' });
    }

    if (!branchCodes || !Array.isArray(branchCodes) || branchCodes.length === 0) {
      return res.json({ success: false, message: 'At least one branch must be selected.' });
    }

    const result = await recordsModel.bulkAssignBranchesToArea({
      office,
      branchAreaId,
      branchCodes,
    });

    return res.json({
      success: true,
      message: `${result.affectedRows} branch(es) assigned successfully.`,
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error('Error bulk assigning branches:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to assign branches.',
    });
  }
}

// END BRANCH MANAGEMENT

// START EMPLOYEE BRANCH ASSIGNMENT
// ======================================================
// EMPLOYEE RECORDS VIEWER (VIEW-ONLY)
// ======================================================

/**
 * Show the employee records viewer page
 */
async function getEmployeeRecordsViewerPage(req, res) {
  try {
    const offices = await utilitiesModel.getOffice();

    res.render('records/employee-records-viewer', {
      title: 'Employee View',
      offices,
      username: req.session.user?.username,
    });
  } catch (error) {
    console.error('Error loading employee records viewer:', error);
    res.status(500).render('error', {
      error: 'Failed to load employee records viewer.',
    });
  }
}

/**
 * Get employees based on filters (region, area, branch)
 * Only returns active employees
 */
async function getEmployeesByFilters(req, res) {
  try {
    const { office, region, area, branch } = req.query;

    if (!office) {
      return res.json({
        success: false,
        message: 'Office is required.',
        employees: [],
      });
    }

    const employees = await recordsModel.getEmployeesByFilters({
      office,
      region,
      area,
      branch,
    });

    return res.json({
      success: true,
      employees,
      count: employees.length,
    });
  } catch (error) {
    console.error('Error fetching employees by filters:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch employees.',
      employees: [],
    });
  }
}

/**
 * Get regions with active employee counts
 */
/**
 * Get regions with active employee counts
 */
const cache = new Map();
const TTL = 60_000; // 1 minute

async function getRegionsWithCount(req, res) {
  try {
    const { office } = req.query;
    if (!office) return res.json({ success: false, message: 'Office is required.', regions: [] });

    const key = `regions:${office}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.time < TTL) {
      return res.json({ success: true, regions: cached.data });
    }

    const regions = await recordsModel.getRegionsWithCount(office);
    cache.set(key, { data: regions, time: Date.now() });
    return res.json({ success: true, regions });
  } catch (error) {
    console.error('Error fetching regions with count:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch regions.', regions: [] });
  }
}

/**
 * Get areas with active employee counts for a specific region
 */
async function getAreasWithCount(req, res) {
  try {
    const { office, regionId } = req.query;

    if (!office || !regionId) {
      return res.json({
        success: false,
        message: 'Office and regionId are required.',
        areas: [],
      });
    }

    const areas = await recordsModel.getAreasWithCount({
      office,
      regionId,
    });

    return res.json({
      success: true,
      areas,
    });
  } catch (error) {
    console.error('Error fetching areas with count:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch areas.',
      areas: [],
    });
  }
}

/**
 * Get branches with active employee counts for a specific area
 */
async function getBranchesWithCount(req, res) {
  try {
    const { office, regionId, areaId } = req.query;

    if (!office || !regionId || !areaId) {
      return res.json({
        success: false,
        message: 'Office, regionId, and areaId are required.',
        branches: [],
      });
    }

    const branches = await recordsModel.getBranchesWithCount({
      office,
      regionId,
      areaId,
    });

    return res.json({
      success: true,
      branches,
    });
  } catch (error) {
    console.error('Error fetching branches with count:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch branches.',
      branches: [],
    });
  }
}

// END EMPLOYEE BRANCH ASSIGNMENT

// Add to recordsController.js

/**
 * Generate New Hires Report
 */
async function generateNewHiresReport(req, res) {
  try {
    const { office, region, sortBy, dateFrom, dateTo, page = 1, limit = 30 } = req.body;

    if (!office) {
      return res.json({
        success: false,
        message: 'Office is required',
      });
    }

    if (!dateFrom || !dateTo) {
      return res.json({
        success: false,
        message: 'Date range is required',
      });
    }

    const result = await recordsModel.getNewHires({
      office,
      region,
      sortBy: sortBy || 'lastname',
      dateFrom,
      dateTo,
      page: Number(page),
      limit: Number(limit),
    });

    return res.json({
      success: true,
      data: result.rows || [],
      total: result.total || 0,
      totalPages: result.totalPages || 0,
      page: result.currentPage || 1,
      limit: Number(limit) || 30,
    });
  } catch (error) {
    console.error('Error generating new hires report:', error);
    return res.json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * Export New Hires to Excel
 */
async function exportNewHiresExcel(req, res) {
  try {
    const filters = {
      ...req.query,
      page: 1,
      limit: 100000, // full export
    };

    const result = await recordsModel.getNewHires(filters);
    const rows = result.rows || [];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('New Hires Report');

    if (rows.length === 0) {
      worksheet.addRow(['No data found']);
    } else {
      // Headers - using the display names from the query
      const headers = [
        'Region',
        'ID No',
        'Last Name',
        'First Name',
        'Birthdate',
        'Designation',
        'Branch',
        'Civil Status',
        'Employment Status',
        'Hired Date',
      ];
      worksheet.addRow(headers);

      // Data
      rows.forEach((row) => {
        const rowData = [
          row.Region || '',
          row['ID No'] || '',
          row['Last Name'] || '',
          row['First Name'] || '',
          row.Birthdate ? formatDate(row.Birthdate) : '',
          row.Designation || '',
          row.Branch || '',
          row['Civil Status'] || '',
          row['Employment Status'] || '',
          row['Hired Date'] ? formatDate(row['Hired Date']) : '',
        ];
        worksheet.addRow(rowData);
      });

      // Styling header
      worksheet.getRow(1).font = { bold: true };
      worksheet.addRow([]); // spacer
      const totalRow = worksheet.addRow([`Total Employees: ${rows.length}`]);
      totalRow.font = { bold: true };
      worksheet.mergeCells(`A${totalRow.number}:${columnLetter(headers.length)}${totalRow.number}`);
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const filename = generateFileName('new_hires_report', 'xlsx', req.query.office);
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).send('Error exporting Excel');
  }
}

/**
 * Export New Hires to PDF
 */
/**
 * Export New Hires to PDF with custom layout
 */
/**
 * Export New Hires to PDF with custom layout
 */
async function exportNewHiresPDF(req, res) {
  try {
    const filters = {
      ...req.query,
      page: 1,
      limit: 100000,
    };

    const result = await recordsModel.getNewHires(filters);
    const rows = result.rows || [];

    // Create PDF with A4 landscape
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      layout: 'landscape',
    });

    res.setHeader('Content-Type', 'application/pdf');
    const filename = generateFileName('new_hires_report', 'pdf', req.query.office);
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    doc.pipe(res);

    if (rows.length === 0) {
      doc.fontSize(11).text('No data found.');
      doc.end();
      return;
    }

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    // const marginLeft = 40;
    // const marginRight = 40;
    const marginLeft = 25;
    const marginRight = 25;
    const usableWidth = pageWidth - marginLeft - marginRight;
    //const bottomLimit = pageHeight - 50;
    const bottomLimit = pageHeight - 30;
    // ─── COLUMN LAYOUT (shared by header + rows so they always match) ──
    // Weights are relative — they get scaled to fill whatever usable
    // width is available, instead of using fixed px that leave a gap.
    const columnKeys = [
      'region',
      'idNo',
      'lastName',
      'firstName',
      'middleName',
      'birthdate',
      'designation',
      'branch',
      'civilStatus',
      'employmentStatus',
      'hiredDate',
      'contactNo',
      'walletNo',
      'blank',
    ];

    // const columnLabels = {
    //   region: 'Region',
    //   idNo: 'ID No',
    //   lastName: 'Last Name',
    //   firstName: 'First Name',
    //   middleName: 'Middle Name',
    //   birthdate: 'Birthdate',
    //   designation: 'Designation',
    //   branch: 'Branch',
    //   civilStatus: 'Civil Status',
    //   employmentStatus: 'Employment Status',
    //   hiredDate: 'Hired Date',
    //   blank: '',
    // };

    const columnLabels = {
      region: 'Region',
      idNo: 'ID No',
      lastName: 'Last Name',
      firstName: 'First Name',
      middleName: 'Middle Name',
      birthdate: 'Birthdate',
      designation: 'Designation',
      branch: 'Branch',
      civilStatus: 'Civil Status',
      employmentStatus: 'Employment Status',
      hiredDate: 'Hired Date',
      contactNo: 'Contact No',
      walletNo: 'Wallet No',
      blank: '',
    };

    // const columnWeights = {
    //   region: 90,
    //   idNo: 40,
    //   lastName: 55,
    //   firstName: 55,
    //   middleName: 62,
    //   birthdate: 48,
    //   designation: 58,
    //   branch: 55,
    //   civilStatus: 45,
    //   employmentStatus: 52,
    //   hiredDate: 48,
    // };

    const columnWeights = {
      region: 80,
      idNo: 38,
      lastName: 50,
      firstName: 50,
      middleName: 55,
      birthdate: 45,
      designation: 52,
      branch: 50,
      civilStatus: 42,
      employmentStatus: 48,
      hiredDate: 45,
      contactNo: 55,
      walletNo: 50,
    };

    const BLANK_COLUMN_WIDTH = 40; // fixed, always blank, no heading

    function computeColumnWidths() {
      const weightSum = Object.values(columnWeights).reduce((a, b) => a + b, 0);
      const availableForData = usableWidth - BLANK_COLUMN_WIDTH;

      const widths = {};
      let allocated = 0;

      Object.keys(columnWeights).forEach((key, idx, arr) => {
        if (idx === arr.length - 1) {
          // last data column gets the remainder to avoid rounding gaps
          widths[key] = availableForData - allocated;
        } else {
          const w = (columnWeights[key] / weightSum) * availableForData;
          widths[key] = w;
          allocated += w;
        }
      });

      widths.blank = BLANK_COLUMN_WIDTH;
      return widths;
    }

    const columnWidths = computeColumnWidths();

    // ─── HEADER SECTION ──────────────────────────────────────────────
    function drawHeader() {
      const headerY = 15;

      // ── LEFT SIDE: Logo and Title ──
      const logoWidth = 80;
      const logoHeight = 45;
      const logoX = marginLeft;

      // Center the logo vertically against the two title lines
      const titleBlockHeight = 32;
      const logoY = headerY + (titleBlockHeight - logoHeight) / 2;

      const logoPath = path.join(__dirname, '../public/images/logo.png');

      try {
        if (fs.existsSync(logoPath)) {
          // Use `fit` (not width+height) so the image scales
          // proportionally instead of being stretched to fill the box.
          doc.image(logoPath, logoX, logoY, {
            fit: [logoWidth, logoHeight],
            align: 'center',
            valign: 'center',
          });
        } else {
          doc
            .rect(logoX, logoY, logoWidth, logoHeight)
            .stroke('#16304A')
            .fontSize(8)
            .fillColor('#16304A')
            .text('LOGO', logoX + 20, logoY + 15, {
              width: logoWidth - 40,
              align: 'center',
            });
        }
      } catch (err) {
        doc
          .rect(logoX, logoY, logoWidth, logoHeight)
          .stroke('#16304A')
          .fontSize(8)
          .fillColor('#16304A')
          .text('LOGO', logoX + 20, logoY + 15, {
            width: logoWidth - 40,
            align: 'center',
          });
      }

      // Title section (beside logo)
      const titleX = logoX + logoWidth + 15;
      const titleWidth = usableWidth - logoWidth - 15;

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#16304A')
        .text('HUMAN RESOURCES MANAGEMENT DIVISION', titleX, headerY + 2, {
          width: titleWidth,
          align: 'left',
        });

      // Reduced from 14 -> 11 per request
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#0F2233')
        .text('NEW EMPLOYEE REPORT', titleX, headerY + 18, {
          width: titleWidth,
          align: 'left',
        });

      // const lineY = headerY + logoHeight + 12;
      // doc
      //   .moveTo(marginLeft, lineY)
      //   .lineTo(pageWidth - marginRight, lineY)
      //   .stroke('#16304A');

      // return lineY + 10;
      const lineY = headerY + logoHeight + 2;
      doc
        .moveTo(marginLeft, lineY)
        .lineTo(pageWidth - marginRight, lineY)
        .stroke('#16304A');

      return lineY + 10;
    }

    // ─── TABLE HEADER ────────────────────────────────────────────────
    function drawTableHeader(startY) {
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#16304A');

      // Measure the tallest label first (some, like "Employment Status",
      // wrap to two lines) so the underline is placed below all the text
      // instead of cutting through it.
      let maxLabelHeight = 10;
      columnKeys.forEach((key) => {
        const label = columnLabels[key];
        const width = columnWidths[key];
        if (label) {
          const h = doc.heightOfString(label, {
            width: width - 4,
            align: 'left',
          });
          maxLabelHeight = Math.max(maxLabelHeight, h);
        }
      });

      let currentX = marginLeft;
      columnKeys.forEach((key) => {
        const label = columnLabels[key];
        const width = columnWidths[key];
        if (label) {
          doc.fillColor('#16304A').text(label, currentX + 2, startY + 2, {
            width: width - 4,
            align: 'left',
          });
        }
        currentX += width;
      });

      const headerEndY = startY + maxLabelHeight + 6;
      doc
        .moveTo(marginLeft, headerEndY)
        .lineTo(pageWidth - marginRight, headerEndY)
        .stroke('#16304A');

      return headerEndY + 4;
    }

    // ─── TABLE ROWS ──────────────────────────────────────────────────
    function drawTableRows(startY, data) {
      let currentY = startY;

      function formatDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (isNaN(date.getTime())) return value;
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
      }

      // function getRowHeight(rowData) {
      //   let maxHeight = 22;
      //   rowData.forEach((value, index) => {
      //     const key = columnKeys[index];
      //     const width = columnWidths[key];
      //     const text = String(value || '');
      //     const height = doc.heightOfString(text, {
      //       width: width - 8,
      //       align: 'left',
      //     });
      //     maxHeight = Math.max(maxHeight, height + 8);
      //   });
      //   return maxHeight;
      // }

      function getRowHeight(rowData) {
        let maxHeight = 24;
        rowData.forEach((value, index) => {
          const key = columnKeys[index];
          const width = columnWidths[key];
          const text = String(value || '');
          const height = doc.heightOfString(text, {
            width: width - 8,
            align: 'left',
          });
          maxHeight = Math.max(maxHeight, height + 10);
        });
        return maxHeight;
      }

      data.forEach((row, rowIndex) => {
        // const rowData = [
        //   row.Region || '',
        //   row['ID No'] || '',
        //   row['Last Name'] || '',
        //   row['First Name'] || '',
        //   row['Middle Name'] || row['Middle Initial'] || row.employeemi || '',
        //   row.Birthdate ? formatDate(row.Birthdate) : '',
        //   row.Designation || '',
        //   row.Branch || '',
        //   row['Civil Status'] || '',
        //   row['Employment Status'] || '',
        //   row['Hired Date'] ? formatDate(row['Hired Date']) : '',
        //   '', // Blank for payroll rate
        // ];
        const rowData = [
          row.Region || '',
          row['ID No'] || '',
          row['Last Name'] || '',
          row['First Name'] || '',
          row['Middle Name'] || row['Middle Initial'] || row.employeemi || '',
          row.Birthdate ? formatDate(row.Birthdate) : '',
          row.Designation || '',
          row.Branch || '',
          row['Civil Status'] || '',
          row['Employment Status'] || '',
          row['Hired Date'] ? formatDate(row['Hired Date']) : '',
          row['Contact No'] || '',
          row['Wallet No'] || '',
          '', // Blank for payroll rate
        ];
        const rowHeight = getRowHeight(rowData);

        if (currentY + rowHeight > bottomLimit) {
          doc.addPage();
          currentY = drawHeader();
          currentY = drawTableHeader(currentY);
        }

        const bgColor = rowIndex % 2 === 0 ? '#FAFBFD' : '#FFFFFF';
        doc.rect(marginLeft, currentY, usableWidth, rowHeight).fill(bgColor);

        doc.rect(marginLeft, currentY, usableWidth, rowHeight).stroke('#E8EAED');

        doc.font('Helvetica').fontSize(7).fillColor('#0F2233');

        let currentX = marginLeft;
        rowData.forEach((value, index) => {
          const key = columnKeys[index];
          const width = columnWidths[key];
          const textX = currentX + 4;
          const textY = currentY + 4;

          if (index === rowData.length - 1) {
            // blank column — intentionally nothing drawn
          } else {
            doc.text(String(value), textX, textY, {
              width: width - 8,
              align: 'left',
              lineBreak: true,
            });
          }
          currentX += width;
        });

        let lineX = marginLeft;
        for (let i = 1; i < columnKeys.length; i++) {
          lineX += columnWidths[columnKeys[i - 1]];
          doc
            .moveTo(lineX, currentY)
            .lineTo(lineX, currentY + rowHeight)
            .stroke('#E8EAED');
        }

        currentY += rowHeight;
      });

      return currentY;
    }

    // ─── FOOTER ──────────────────────────────────────────────────────
    function drawFooter(totalCount, pageNumber, totalPages, lastRowY) {
      const footerY = lastRowY + 12;

      doc
        .moveTo(marginLeft, footerY)
        .lineTo(pageWidth - marginRight, footerY)
        .stroke('#CCCCCC');

      const textY = footerY + 6;

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#16304A')
        .text(`Total Employees: ${totalCount}`, marginLeft, textY, {
          width: 200,
          align: 'left',
        });

      // doc
      //   .font('Helvetica')
      //   .fontSize(7)
      //   .fillColor('#666666')
      //   .text(`Page ${pageNumber} of ${totalPages}`, 0, textY, {
      //     width: pageWidth,
      //     align: 'center',
      //   });

      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#666666')
        .text(`Generated: ${dateStr} ${timeStr}`, 0, textY, {
          width: pageWidth - marginRight,
          align: 'right',
        });
    }

    // ─── RENDER THE PDF ─────────────────────────────────────────────
    let currentY = drawHeader();
    currentY = drawTableHeader(currentY);
    currentY = drawTableRows(currentY, rows);
    drawFooter(rows.length, 1, 1, currentY);

    doc.end();
  } catch (error) {
    console.error('Error exporting PDF:', error);
    res.status(500).send('Error exporting PDF');
  }
}

// Helper function to format dates
function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

module.exports = {
  showEmployeeEntryPage,
  saveEmployee,
  getRecordsReportsPage,
  getRegionsByOffice,
  getAreasByOffice,
  getBranchesByOffice,
  getEmployeeStatuses,
  getSortOptions,
  getEmployeeTypes,
  generateRecordsReport,
  exportMasterlistExcel,
  exportMasterlistPDF,
  getRegionManagementPage,
  saveRegion,
  searchRegionManager,
  getRegionListPage,
  getRegionCreatePage,
  getRegionEditPage,
  updateRegion,
  handleEmployeeEntryOfficeSelection,
  showApplicantSearchPage,
  showEmployeeEntryForm,
  showEmployeeUpdatePage,
  searchEmployeesForUpdate,
  showEmployeeUpdateForm,
  updateEmployeeRecord,
  getDesignationManagementPage,
  saveDesignation,
  updateDesignation,

  getBranchManagementPage,
  getRegionsForBranch,
  getAreasForBranch,
  getBranchesByArea,
  saveBranch,
  updateBranch,
  transferBranch,
  toggleBranchStatus,
  checkBranchEmployees,
  getAffectedEmployeesPreview,
  getBranchesWithoutArea,
  bulkAssignBranches,
  getEmployeeRecordsViewerPage,
  getEmployeesByFilters,
  getRegionsWithCount,
  getAreasWithCount,
  getBranchesWithCount,
  getDesignationsForReports,
  exportNewHiresPDF,
  generateNewHiresReport,
  exportNewHiresExcel,
};
